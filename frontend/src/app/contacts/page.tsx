"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface Contact {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  canal?: string;
  tags: string[];
  criadoEm: string;
}

interface TagOption {
  id: string;
  nome: string;
  cor: string;
}

interface ImportResult {
  imported: number;
  updated: number;
  errors: { linha: number; erro: string }[];
}

const CANAIS = ["whatsapp", "instagram", "messenger", "telegram", "outro"] as const;
const LIMIT = 50;

const EMPTY_FORM = {
  nome: "",
  telefone: "",
  email: "",
  canal: "whatsapp" as string,
  tags: [] as string[],
};

function applyPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function canalLabel(c?: string) {
  if (!c) return "—";
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<"create" | "edit" | "import" | null>(null);
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/contacts", {
        params: { ...(q ? { q } : {}), page, limit: LIMIT },
      });
      setContacts(data.contacts);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/tags")
      .then(({ data }) => setAllTags(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditTarget(null);
    setModal("create");
  }

  function openEdit(c: Contact) {
    setForm({
      nome: c.nome,
      telefone: c.telefone ? applyPhoneMask(c.telefone.replace(/^55/, "")) : "",
      email: c.email || "",
      canal: c.canal || "whatsapp",
      tags: c.tags || [],
    });
    setFormError(null);
    setEditTarget(c);
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditTarget(null);
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setFormError(null);
  }

  async function saveForm() {
    if (!form.nome.trim()) {
      setFormError("Nome é obrigatório");
      return;
    }
    if (form.canal === "whatsapp" && !form.telefone.trim()) {
      setFormError("Telefone é obrigatório para canal WhatsApp");
      return;
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      setFormError("E-mail inválido");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim() || undefined,
        email: form.email.trim() || undefined,
        canal: form.canal,
        tags: form.tags,
      };

      if (modal === "create") {
        await api.post("/contacts", payload);
      } else if (editTarget) {
        await api.put(`/contacts/${editTarget.id}`, payload);
      }
      closeModal();
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.error || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function startConversation(c: Contact) {
    try {
      const { data } = await api.post("/conversations/from-contact", { contactId: c.id });
      router.push(`/chats?selected=${data.leadId}`);
    } catch (err: any) {
      alert(err.response?.data?.error || "Erro ao iniciar conversa");
    }
  }

  async function deleteContact(c: Contact) {
    if (!confirm(`Deletar "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/contacts/${c.id}`);
      await load();
    } catch {
      alert("Erro ao deletar contato");
    }
  }

  async function handleExport() {
    try {
      const { data } = await api.get("/contacts/export", {
        responseType: "blob",
        params: q ? { q } : {},
      });
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `contatos-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar contatos");
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const { data } = await api.post("/contacts/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      if (data.imported > 0 || data.updated > 0) await load();
    } catch (err: any) {
      setImportError(err.response?.data?.error || "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center gap-3 shrink-0 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 mr-2">Contatos</h1>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar contato..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 w-52"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setImportFile(null);
              setImportResult(null);
              setImportError(null);
              setModal("import");
            }}
            className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 bg-white px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <Upload size={14} />
            Importar CSV
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 bg-white px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <Download size={14} />
            Exportar CSV
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <Plus size={15} />
            Novo contato
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <div className="bg-white rounded-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left font-medium">Nome</th>
                    <th className="px-4 py-3 text-left font-medium">Telefone</th>
                    <th className="px-4 py-3 text-left font-medium">E-mail</th>
                    <th className="px-4 py-3 text-left font-medium">Canal</th>
                    <th className="px-4 py-3 text-left font-medium">Tags</th>
                    <th className="px-4 py-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contacts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-gray-400"
                      >
                        {q
                          ? "Nenhum contato encontrado para esta busca."
                          : "Nenhum contato cadastrado."}
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {c.nome}
                        </td>
                        <td className="px-4 py-3 text-gray-500 tabular-nums">
                          {c.telefone || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {c.email || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {c.canal ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {canalLabel(c.canal)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(c.tags || []).slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700"
                              >
                                {t}
                              </span>
                            ))}
                            {(c.tags || []).length > 3 && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => startConversation(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
                              title="Iniciar conversa"
                            >
                              <MessageSquare size={14} />
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteContact(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Deletar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>
                  {total} contato{total !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="px-2 text-xs">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {(modal === "create" || modal === "edit") && (
        <ContactModal
          mode={modal}
          form={form}
          setForm={setForm}
          allTags={allTags}
          onSave={saveForm}
          onClose={closeModal}
          saving={saving}
          error={formError}
        />
      )}

      {modal === "import" && (
        <ImportModal
          file={importFile}
          onFileChange={setImportFile}
          onImport={handleImport}
          importing={importing}
          result={importResult}
          error={importError}
          onClose={closeModal}
          fileInputRef={fileInputRef}
        />
      )}
    </div>
  );
}

// ── ContactModal ───────────────────────────────────────────────────────────────

interface ContactModalProps {
  mode: "create" | "edit";
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  allTags: TagOption[];
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}

function ContactModal({
  mode,
  form,
  setForm,
  allTags,
  onSave,
  onClose,
  saving,
  error,
}: ContactModalProps) {
  const [tagOpen, setTagOpen] = useState(false);

  function f<K extends keyof typeof EMPTY_FORM>(
    key: K,
    value: (typeof EMPTY_FORM)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePhoneInput(e: React.ChangeEvent<HTMLInputElement>) {
    f("telefone", applyPhoneMask(e.target.value));
  }

  function toggleTag(nome: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(nome)
        ? prev.tags.filter((t) => t !== nome)
        : [...prev.tags, nome],
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {mode === "create" ? "Novo contato" : "Editar contato"}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Nome *
            </label>
            <input
              autoFocus
              type="text"
              value={form.nome}
              onChange={(e) => f("nome", e.target.value)}
              placeholder="Nome do contato"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Canal
              </label>
              <select
                value={form.canal}
                onChange={(e) => f("canal", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {CANAIS.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Telefone {form.canal === "whatsapp" ? "*" : ""}
              </label>
              <input
                type="tel"
                value={form.telefone}
                onChange={handlePhoneInput}
                placeholder="(11) 99999-9999"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => f("email", e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {allTags.length > 0 && (
            <div className="relative">
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Tags
              </label>
              <button
                type="button"
                onClick={() => setTagOpen((v) => !v)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-green-400 flex items-center justify-between"
              >
                <span className="text-gray-500 truncate">
                  {form.tags.length === 0
                    ? "Selecionar tags..."
                    : form.tags.join(", ")}
                </span>
                <span className="text-gray-400 text-[10px] shrink-0">
                  {tagOpen ? "▲" : "▼"}
                </span>
              </button>
              {tagOpen && (
                <div className="absolute z-10 top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                  {allTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.nome)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.cor }}
                      />
                      <span className="flex-1 text-gray-700">{t.nome}</span>
                      {form.tags.includes(t.nome) && (
                        <Check size={13} className="text-green-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

// ── ImportModal ────────────────────────────────────────────────────────────────

interface ImportModalProps {
  file: File | null;
  onFileChange: (f: File | null) => void;
  onImport: () => void;
  importing: boolean;
  result: ImportResult | null;
  error: string | null;
  onClose: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

function ImportModal({
  file,
  onFileChange,
  onImport,
  importing,
  result,
  error,
  onClose,
  fileInputRef,
}: ImportModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !importing && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            Importar contatos via CSV
          </h3>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Cabeçalho esperado:{" "}
            <code className="bg-gray-100 px-1 rounded">
              nome,telefone,email,canal,tags
            </code>
            . Coluna <strong>nome</strong> é obrigatória. Tags separadas por{" "}
            <code className="bg-gray-100 px-1 rounded">;</code>.
          </p>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 hover:border-green-400 rounded-xl py-6 text-sm text-gray-400 hover:text-green-600 transition flex flex-col items-center gap-2"
            >
              <Upload size={22} />
              <span>
                {file ? file.name : "Clique para selecionar arquivo .csv"}
              </span>
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-600">
                Resultado da importação:
              </p>
              <p className="text-xs text-green-700">
                ✓ {result.imported} importado{result.imported !== 1 ? "s" : ""}{" "}
                · {result.updated} atualizado{result.updated !== 1 ? "s" : ""}
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-28 overflow-y-auto space-y-1 mt-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      Linha {e.linha}: {e.erro}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
          >
            {result ? "Fechar" : "Cancelar"}
          </button>
          {!result && (
            <button
              onClick={onImport}
              disabled={!file || importing}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Upload size={14} />
              {importing ? "Importando..." : "Importar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
