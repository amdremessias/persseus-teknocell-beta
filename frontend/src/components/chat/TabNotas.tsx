"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Trash2, Edit2, Check, X } from "lucide-react";

interface Nota {
  id: string;
  conteudo: string;
  criadoEm: string;
  atualizadoEm: string;
  userId: string;
  user?: { id: string; nome: string };
}

interface Props {
  leadId: string;
  onCountChange?: (n: number) => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TabNotas({ leadId, onCountChange }: Props) {
  const { user } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchNotas = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/leads/${leadId}/notes`);
      const list: Nota[] = Array.isArray(data) ? data : data?.notes || [];
      setNotas(list);
      onCountChange?.(list.length);
    } catch {
      setNotas([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [leadId, onCountChange]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  async function save() {
    if (saving || !draft.trim()) return;
    setSaving(true);
    try {
      await api.post(`/leads/${leadId}/notes`, { conteudo: draft.trim() });
      setDraft("");
      await fetchNotas();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta nota?")) return;
    await api.delete(`/notes/${id}`).catch(() => null);
    await fetchNotas();
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await api.patch(`/notes/${id}`, { conteudo: editText.trim() }).catch(() => null);
    setEditingId(null);
    setEditText("");
    await fetchNotas();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FFFBEB]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-gray-400 text-sm">Carregando notas...</p>
        ) : notas.length === 0 ? (
          <p className="text-gray-400 text-sm italic">Nenhuma nota interna ainda. Notas só são vistas por atendentes — nunca vão para o cliente.</p>
        ) : (
          notas.map((n) => {
            const isMine = n.userId === user?.id;
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} className="bg-white rounded-lg shadow-sm border-l-4 border-l-orange-400 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-gray-700">{n.user?.nome || "—"}</span>
                    <span className="text-gray-400">{fmtDate(n.criadoEm)}</span>
                  </div>
                  {isMine && !isEditing && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingId(n.id); setEditText(n.conteudo); }}
                        className="text-gray-400 hover:text-blue-600 p-0.5"
                        title="Editar"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => remove(n.id)}
                        className="text-gray-400 hover:text-red-600 p-0.5"
                        title="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => { setEditingId(null); setEditText(""); }} className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100">
                        <X size={12} className="inline" /> Cancelar
                      </button>
                      <button onClick={() => saveEdit(n.id)} className="text-xs px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600">
                        <Check size={12} className="inline" /> Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.conteudo}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-orange-200 bg-white p-3 shrink-0">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nova nota interna (só os atendentes veem)..."
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={save}
            disabled={!draft.trim() || saving}
            className="text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition"
          >
            {saving ? "Salvando..." : "Salvar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}
