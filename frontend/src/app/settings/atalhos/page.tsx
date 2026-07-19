"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Edit2, Trash2, Plus, Check, X } from "lucide-react";

interface QuickReply {
  id: string;
  atalho: string;
  texto: string;
  escopo: "company" | "user";
  userId: string | null;
}

export default function AtalhosSettingsPage() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAtalho, setNewAtalho] = useState("");
  const [newTexto, setNewTexto] = useState("");
  const [newEscopo, setNewEscopo] = useState<"company" | "user">("company");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAtalho, setEditAtalho] = useState("");
  const [editTexto, setEditTexto] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quick-replies");
      setItems(Array.isArray(data) ? data : data?.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function create() {
    if (!newAtalho.trim() || !newTexto.trim()) return;
    try {
      await api.post("/quick-replies", {
        atalho: newAtalho.trim(),
        texto: newTexto.trim(),
        escopo: newEscopo,
      });
      setNewAtalho("");
      setNewTexto("");
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao criar");
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    await api.patch(`/quick-replies/${editingId}`, {
      atalho: editAtalho.trim(),
      texto: editTexto.trim(),
    }).catch((err) => alert(err.response?.data?.error || "erro"));
    setEditingId(null);
    await refresh();
  }

  async function remove(q: QuickReply) {
    if (!confirm(`Excluir atalho "/${q.atalho}"?`)) return;
    await api.delete(`/quick-replies/${q.id}`).catch(() => null);
    await refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl space-y-5">
        <div className="mb-2">
          <h1 className="text-xl font-bold text-gray-900">Respostas rápidas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Crie atalhos como <code className="bg-gray-100 px-1 rounded">/horario</code> para inserir textos prontos no chat.
          </p>
        </div>

        <div className="bg-white rounded-card shadow-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">Novo atalho</h2>
          <div className="grid grid-cols-[140px_1fr_140px] gap-2">
            <input
              value={newAtalho}
              onChange={(e) => setNewAtalho(e.target.value)}
              placeholder="atalho"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <input
              value={newTexto}
              onChange={(e) => setNewTexto(e.target.value)}
              placeholder="Texto da resposta"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <select
              value={newEscopo}
              onChange={(e) => setNewEscopo(e.target.value as "company" | "user")}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="company">Equipe</option>
              <option value="user">Só você</option>
            </select>
          </div>
          {newTexto && (
            <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 italic">
              Preview: ao digitar <code className="bg-white px-1 rounded">/{newAtalho || "atalho"}</code>, o texto será substituído por:
              <p className="mt-1 text-gray-800 not-italic">{newTexto}</p>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={!newAtalho.trim() || !newTexto.trim()}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-1"
            >
              <Plus size={14} />
              Criar atalho
            </button>
          </div>
        </div>

        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-800 px-5 pt-4">Atalhos cadastrados</h2>
          {loading ? (
            <p className="text-sm text-gray-400 p-5">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 italic p-5">Nenhum atalho cadastrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-2">Atalho</th>
                  <th className="text-left px-5 py-2">Texto</th>
                  <th className="text-left px-5 py-2">Escopo</th>
                  <th className="text-right px-5 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => {
                  const isEditing = editingId === q.id;
                  return (
                    <tr key={q.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 align-top">
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <input
                            value={editAtalho}
                            onChange={(e) => setEditAtalho(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">/{q.atalho}</code>
                        )}
                      </td>
                      <td className="px-5 py-3 max-w-md">
                        {isEditing ? (
                          <textarea
                            value={editTexto}
                            onChange={(e) => setEditTexto(e.target.value)}
                            rows={3}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full resize-none"
                          />
                        ) : (
                          <p className="text-gray-700 line-clamp-3 whitespace-pre-wrap">{q.texto}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {q.escopo === "user" ? (
                          <span className="text-[11px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">pessoal</span>
                        ) : (
                          <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">equipe</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-700 p-1"><Check size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => { setEditingId(q.id); setEditAtalho(q.atalho); setEditTexto(q.texto); }}
                              className="text-gray-400 hover:text-blue-600 p-1"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => remove(q)} className="text-gray-400 hover:text-red-600 p-1">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
