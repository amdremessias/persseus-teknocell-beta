"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Pencil, Trash2, Smartphone, X, Check, Save } from "lucide-react";

interface StockItem {
  id: number;
  modelo: string;
  condicao: "novo" | "seminovo";
  precoPix: number;
  observacao: string | null;
  ativo: boolean;
  ordem: number;
}

interface Pagamento {
  desconto_pix: string;
  parcelado: string;
  kit_protecao: string;
  garantia_novo: string;
  garantia_seminovo: string;
}

const EMPTY_FORM = {
  modelo: "",
  condicao: "seminovo" as "novo" | "seminovo",
  precoPix: "",
  observacao: "",
  ativo: true,
  ordem: "0",
};

const PAGAMENTO_LABELS: { key: keyof Pagamento; label: string; placeholder: string }[] = [
  { key: "desconto_pix",     label: "Desconto PIX",        placeholder: "ex: 5% OFF" },
  { key: "parcelado",        label: "Parcelamento",        placeholder: "ex: até 12x" },
  { key: "kit_protecao",     label: "Kit proteção",        placeholder: "ex: capa + película + película da câmera" },
  { key: "garantia_novo",    label: "Garantia (novo)",     placeholder: "ex: 1 ano Apple + 6 meses loja" },
  { key: "garantia_seminovo",label: "Garantia (seminovo)", placeholder: "ex: 6 meses loja" },
];

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export default function CatalogoIphonePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: StockItem } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [pagamentoDraft, setPagamentoDraft] = useState<Pagamento | null>(null);
  const [savingPag, setSavingPag] = useState(false);
  const [pagSaved, setPagSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, pagRes] = await Promise.all([
        api.get("/admin/catalogo-iphone"),
        api.get("/admin/catalogo-iphone/pagamento"),
      ]);
      setItems(itemsRes.data);
      setPagamento(pagRes.data);
      setPagamentoDraft(pagRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setModal({ mode: "create" });
  }

  function openEdit(item: StockItem) {
    setForm({
      modelo: item.modelo,
      condicao: item.condicao,
      precoPix: String(item.precoPix),
      observacao: item.observacao ?? "",
      ativo: item.ativo,
      ordem: String(item.ordem),
    });
    setError(null);
    setModal({ mode: "edit", item });
  }

  async function saveForm() {
    if (!form.modelo.trim()) { setError("Modelo é obrigatório"); return; }
    const precoNum = parseInt(form.precoPix, 10);
    if (!precoNum || precoNum <= 0) { setError("Preço PIX deve ser um valor inteiro positivo"); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        modelo: form.modelo.trim(),
        condicao: form.condicao,
        precoPix: precoNum,
        observacao: form.observacao.trim() || null,
        ativo: form.ativo,
        ordem: parseInt(form.ordem || "0", 10),
      };
      if (modal?.mode === "create") {
        await api.post("/admin/catalogo-iphone", payload);
      } else if (modal?.item) {
        await api.patch(`/admin/catalogo-iphone/${modal.item.id}`, payload);
      }
      setModal(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(item: StockItem) {
    setTogglingId(item.id);
    try {
      await api.patch(`/admin/catalogo-iphone/${item.id}`, { ativo: !item.ativo });
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteItem(item: StockItem) {
    if (!confirm(`Deletar "${item.modelo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/admin/catalogo-iphone/${item.id}`);
      await load();
    } catch {
      alert("Erro ao deletar");
    }
  }

  async function savePagamento() {
    if (!pagamentoDraft) return;
    setSavingPag(true);
    try {
      const { data } = await api.put("/admin/catalogo-iphone/pagamento", pagamentoDraft);
      setPagamento(data);
      setPagamentoDraft(data);
      setPagSaved(true);
      setTimeout(() => setPagSaved(false), 2500);
    } finally {
      setSavingPag(false);
    }
  }

  const pagDirty = pagamentoDraft && pagamento &&
    PAGAMENTO_LABELS.some(({ key }) => pagamentoDraft[key] !== pagamento[key]);

  const novos = items.filter(i => i.condicao === "novo");
  const seminovos = items.filter(i => i.condicao === "seminovo");

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl space-y-5">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Smartphone size={20} className="text-gray-500" />
              Catálogo iPhone
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Modelos e preços que o site iphone.teknoscel.shop usa para recomendar aos clientes.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shrink-0"
          >
            <Plus size={15} />
            Adicionar modelo
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <>
            <ItemTable
              title="Novos lacrados"
              items={novos}
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleAtivo}
              togglingId={togglingId}
            />
            <ItemTable
              title="Seminovos"
              items={seminovos}
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleAtivo}
              togglingId={togglingId}
            />
            {items.length === 0 && (
              <div className="bg-white rounded-card shadow-card p-8 text-center text-sm text-gray-400">
                Nenhum modelo cadastrado. Clique em "+ Adicionar modelo" para começar.
              </div>
            )}

            {/* Condições de pagamento */}
            {pagamentoDraft && (
              <div className="bg-white rounded-card shadow-card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-700">Condições de pagamento</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Exibidas no site junto aos preços dos modelos.</p>
                  </div>
                  {pagSaved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check size={12} /> Salvo
                    </span>
                  )}
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PAGAMENTO_LABELS.map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                      <input
                        type="text"
                        value={pagamentoDraft[key]}
                        onChange={e => setPagamentoDraft(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                        placeholder={placeholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-4 flex justify-end">
                  <button
                    onClick={savePagamento}
                    disabled={savingPag || !pagDirty}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <Save size={14} />
                    {savingPag ? "Salvando..." : "Salvar condições"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <FormModal
          mode={modal.mode}
          form={form}
          setForm={setForm}
          onSave={saveForm}
          onClose={() => setModal(null)}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

interface TableProps {
  title: string;
  items: StockItem[];
  onEdit: (i: StockItem) => void;
  onDelete: (i: StockItem) => void;
  onToggle: (i: StockItem) => void;
  togglingId: number | null;
}

function ItemTable({ title, items, onEdit, onDelete, onToggle, togglingId }: TableProps) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-5 py-2.5 text-left font-medium">Modelo</th>
              <th className="px-4 py-2.5 text-left font-medium">Condição</th>
              <th className="px-4 py-2.5 text-right font-medium">Preço PIX</th>
              <th className="px-4 py-2.5 text-left font-medium">Observação</th>
              <th className="px-4 py-2.5 text-center font-medium">Ativo</th>
              <th className="px-4 py-2.5 text-center font-medium">Ordem</th>
              <th className="px-4 py-2.5 text-center font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.id} className={`hover:bg-gray-50 transition ${!item.ativo ? "opacity-50" : ""}`}>
                <td className="px-5 py-3 font-medium text-gray-800">{item.modelo}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    item.condicao === "novo"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {item.condicao === "novo" ? "Novo lacrado" : "Seminovo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-800 tabular-nums">
                  {formatBRL(item.precoPix)}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">
                  {item.observacao || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onToggle(item)}
                    disabled={togglingId === item.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      item.ativo ? "bg-green-500" : "bg-gray-200"
                    } ${togglingId === item.id ? "opacity-50" : ""}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      item.ativo ? "translate-x-4.5" : "translate-x-0.5"
                    }`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center text-gray-500 tabular-nums">{item.ordem}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => onEdit(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      title="Deletar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FormModalProps {
  mode: "create" | "edit";
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}

function FormModal({ mode, form, setForm, onSave, onClose, saving, error }: FormModalProps) {
  function f(key: keyof typeof EMPTY_FORM, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {mode === "create" ? "Adicionar modelo" : "Editar modelo"}
          </h3>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Modelo *</label>
            <input
              type="text"
              value={form.modelo}
              onChange={e => f("modelo", e.target.value)}
              placeholder="ex: iPhone 13 128GB"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Condição *</label>
              <select
                value={form.condicao}
                onChange={e => f("condicao", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="novo">Novo lacrado</option>
                <option value="seminovo">Seminovo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Preço PIX (R$) *</label>
              <input
                type="number"
                min="1"
                value={form.precoPix}
                onChange={e => f("precoPix", e.target.value)}
                placeholder="ex: 2390"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observação</label>
            <textarea
              rows={2}
              value={form.observacao}
              onChange={e => f("observacao", e.target.value)}
              placeholder="texto livre opcional..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Ordem</label>
              <input
                type="number"
                min="0"
                value={form.ordem}
                onChange={e => f("ordem", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <button
                type="button"
                onClick={() => f("ativo", !form.ativo)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  form.ativo ? "bg-green-500" : "bg-gray-200"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  form.ativo ? "translate-x-4.5" : "translate-x-0.5"
                }`} />
              </button>
              <span className="text-xs text-gray-600">{form.ativo ? "Ativo" : "Inativo"}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <Check size={14} />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
