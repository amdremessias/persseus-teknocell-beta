"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Edit2, Trash2, Plus, Check, X } from "lucide-react";

interface Tag {
  id: string;
  nome: string;
  cor: string;
  leadCount: number;
}

const PALETTE = ["#1B5E20", "#0D47A1", "#FF6B00", "#4A148C", "#B71C1C", "#757575", "#F59E0B", "#0EA5E9"];

export default function TagsSettingsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PALETTE[0]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tags");
      setTags(Array.isArray(data) ? data : data?.tags || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function create() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await api.post("/tags", { nome: newName.trim(), cor: newColor });
      setNewName("");
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao criar");
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    await api.patch(`/tags/${editingId}`, { nome: editName.trim(), cor: editColor }).catch(() => null);
    setEditingId(null);
    await refresh();
  }

  async function remove(t: Tag) {
    if (!confirm(`Excluir tag "${t.nome}"? Será removida de ${t.leadCount} lead(s).`)) return;
    await api.delete(`/tags/${t.id}`).catch(() => null);
    await refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-2xl space-y-5">
        <div className="mb-2">
          <h1 className="text-xl font-bold text-gray-900">Tags</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Categorize conversas por tipo de produto, prioridade ou interesse.
          </p>
        </div>

        <div className="bg-white rounded-card shadow-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Nova tag</h2>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome (ex: iPhone, VIP)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              onClick={create}
              disabled={!newName.trim() || creating}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-1"
            >
              <Plus size={14} />
              Criar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Cor:</span>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-7 h-7 rounded-full ${newColor === c ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-800 px-5 pt-4">Todas as tags</h2>
          {loading ? (
            <p className="text-sm text-gray-400 p-5">Carregando...</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-gray-400 italic p-5">Nenhuma tag cadastrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-2">Tag</th>
                  <th className="text-left px-5 py-2">Cor</th>
                  <th className="text-left px-5 py-2">Leads</th>
                  <th className="text-right px-5 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => {
                  const isEditing = editingId === t.id;
                  return (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: t.cor }}>
                              {t.nome}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            {PALETTE.map((c) => (
                              <button
                                key={c}
                                onClick={() => setEditColor(c)}
                                className={`w-5 h-5 rounded-full ${editColor === c ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.cor }} />
                            <span className="text-xs text-gray-500">{t.cor}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{t.leadCount}</td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1" title="Cancelar">
                              <X size={14} />
                            </button>
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-700 p-1" title="Salvar">
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => { setEditingId(t.id); setEditName(t.nome); setEditColor(t.cor); }}
                              className="text-gray-400 hover:text-blue-600 p-1"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => remove(t)} className="text-gray-400 hover:text-red-600 p-1" title="Excluir">
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
