"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Check, Pencil, Plus, Trash2, Users, X } from "lucide-react";

interface User {
  id: string;
  nome: string;
  email: string;
  nivel: string;
  ativo: boolean;
}

interface TeamMember {
  id: string;
  papel: string;
  user: User;
}

interface Team {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ativo?: boolean;
  _count?: { queues: number };
  members: TeamMember[];
}

const PAPEIS = ["lider", "supervisor", "membro"];
const PALETTE = ["#1B5E20", "#0D47A1", "#FF6B00", "#4A148C", "#B71C1C", "#757575"];

export default function GroupsSettingsPage() {
  const [groups, setGroups] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ nome: "", descricao: "", cor: PALETTE[0] });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [memberOf, setMemberOf] = useState<Team | null>(null);
  const [memberSel, setMemberSel] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const { data } = await api.get("/teams");
    setGroups(Array.isArray(data) ? data : data?.teams || []);
  }, []);

  useEffect(() => {
    refresh();
    api.get("/users")
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : r.data?.users || []))
      .catch(() => setUsers([]));
  }, [refresh]);

  function startNew() {
    setForm({ nome: "", descricao: "", cor: PALETTE[0] });
    setEditId(null);
    setShowForm(true);
  }

  function startEdit(t: Team) {
    setForm({ nome: t.nome, descricao: t.descricao || "", cor: t.cor || PALETTE[0] });
    setEditId(t.id);
    setShowForm(true);
  }

  async function save() {
    if (!form.nome.trim()) { alert("Nome obrigatório"); return; }
    const payload = { nome: form.nome.trim(), descricao: form.descricao.trim() || null, cor: form.cor };
    try {
      if (editId) await api.put(`/teams/${editId}`, payload);
      else await api.post("/teams", payload);
      setShowForm(false);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao salvar grupo");
    }
  }

  async function remove(t: Team) {
    if (!confirm(`Excluir grupo "${t.nome}"?`)) return;
    await api.delete(`/teams/${t.id}`).catch(() => null);
    await refresh();
  }

function openMembers(t: Team) {
    setMemberOf(t);
    const sel: Record<string, string> = {};
    for (const m of t.members) sel[m.user.id] = m.papel;
    setMemberSel(sel);
  }

  async function saveMembers() {
    if (!memberOf) return;
    const members = Object.entries(memberSel)
      .filter(([, papel]) => papel)
      .map(([userId, papel]) => ({ userId, papel }));
    try {
      await api.put(`/teams/${memberOf.id}/members`, { members });
      setMemberOf(null);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao salvar membros");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl space-y-5">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Grupos / times</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Agrupe sua equipe por área (ex: Vendas, Assistência) e associe usuários a cada grupo.
            </p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition"
          >
            <Plus size={16} /> Novo grupo
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-card shadow-card p-5 space-y-4">
            <h2 className="font-semibold text-gray-700">{editId ? "Editar grupo" : "Novo grupo"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Nome do grupo" value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input placeholder="Descrição (opcional)" value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Cor:</span>
              {PALETTE.map((c) => (
                <button key={c} onClick={() => setForm((p) => ({ ...p, cor: c }))}
                  className={`w-7 h-7 rounded-full ${form.cor === c ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={save} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                <Check size={15} /> Salvar
              </button>
              <button onClick={() => setShowForm(false)} className="flex items-center gap-1.5 text-gray-500 px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition">
                <X size={15} /> Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {groups.length === 0 && (
            <p className="text-sm text-gray-400 italic">Nenhum grupo cadastrado.</p>
          )}
          {groups.map((t) => (
            <div key={t.id} className="bg-white rounded-card shadow-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.cor || "#1B5E20" }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{t.nome}</p>
                    {t.descricao && <p className="text-xs text-gray-400 truncate">{t.descricao}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500">
                    <Users size={13} className="inline mr-1" />
                    {t.members.length} membro(s)
                    {t._count?.queues ? ` · ${t._count.queues} fila(s)` : ""}
                  </span>
                  <button onClick={() => openMembers(t)} className="text-xs font-medium text-green-700 hover:bg-green-50 rounded-lg px-2 py-1.5 transition flex items-center gap-1">
                    <Users size={13} /> Membros
                  </button>
                  <button onClick={() => startEdit(t)} className="text-gray-400 hover:text-blue-500" title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => remove(t)} className="text-gray-400 hover:text-red-500" title="Excluir"><Trash2 size={15} /></button>
                </div>
              </div>
              {t.members.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.members.slice(0, 8).map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">
                      {m.user.nome.split(" ")[0]}
                      <span className="text-[10px] uppercase text-gray-400">{m.papel}</span>
                    </span>
                  ))}
                  {t.members.length > 8 && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-500">+{t.members.length - 8}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal: membros do grupo */}
      {memberOf && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-16 px-4" onClick={() => setMemberOf(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900 text-sm">Membros — {memberOf.nome}</h3>
              <button onClick={() => setMemberOf(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-3 space-y-1">
              {users.filter((u) => u.ativo).map((u) => {
                const papel = memberSel[u.id] || "";
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{u.nome}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <select
                      value={papel}
                      onChange={(e) => setMemberSel((p) => ({ ...p, [u.id]: e.target.value as any }))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="">—</option>
                      {PAPEIS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={saveMembers} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                <Check size={15} /> Salvar membros
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}