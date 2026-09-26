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

interface QueueMember {
  id: string;
  profile: string;
  prioridade: number;
  user: User;
}

interface Team {
  id: string;
  nome: string;
  cor: string;
}

interface Queue {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ativa: boolean;
  horarioInicio: string | null;
  horarioFim: string | null;
  diasSemana: number[];
  estrategiaAtribuicao: string;
  maxLeadsPorAtendente: number | null;
  timeoutSegundos: number;
  teamId: string | null;
  team: Team | null;
  members: QueueMember[];
  abiertos?: number;
}

const STRATEGIES = ["round_robin", "least_busy", "skill_based", "manual"];
const PROFILES = ["atendente", "supervisor", "gestor"];
const PALETTE = ["#1B5E20", "#0D47A1", "#FF6B00", "#4A148C", "#B71C1C", "#757575"];
const DIAS = [
  { v: 1, label: "seg" },
  { v: 2, label: "ter" },
  { v: 3, label: "qua" },
  { v: 4, label: "qui" },
  { v: 5, label: "sex" },
  { v: 6, label: "sáb" },
  { v: 0, label: "dom" },
];

function blankForm() {
  return {
    nome: "",
    descricao: "",
    cor: PALETTE[0],
    ativa: true,
    horarioInicio: "08:00",
    horarioFim: "18:00",
    diasSemana: [1, 2, 3, 4, 5],
    estrategiaAtribuicao: "round_robin",
    maxLeadsPorAtendente: 20,
    timeoutSegundos: 120,
    teamId: "",
  };
}

export default function FilasSettingsPage() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<ReturnType<typeof blankForm>>(blankForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [memberOf, setMemberOf] = useState<Queue | null>(null);
  const [memberSel, setMemberSel] = useState<Record<string, { profile: string; prioridade: number }>>({});

  const refresh = useCallback(async () => {
    const { data } = await api.get("/queues");
    setQueues(Array.isArray(data) ? data : data?.queues || []);
  }, []);

  useEffect(() => {
    refresh();
    api.get("/teams")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : r.data?.teams || [];
        setTeams(list.map((t: any) => ({ id: t.id, nome: t.nome, cor: t.cor })));
      })
      .catch(() => setTeams([]));
    api.get("/users")
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : r.data?.users || []))
      .catch(() => setUsers([]));
  }, [refresh]);

  function startNew() {
    setForm(blankForm());
    setEditId(null);
    setShowForm(true);
  }

  function startEdit(q: Queue) {
    setForm({
      nome: q.nome,
      descricao: q.descricao || "",
      cor: q.cor || PALETTE[0],
      ativa: q.ativa,
      horarioInicio: q.horarioInicio || "",
      horarioFim: q.horarioFim || "",
      diasSemana: q.diasSemana?.length ? q.diasSemana : [],
      estrategiaAtribuicao: q.estrategiaAtribuicao,
      maxLeadsPorAtendente: q.maxLeadsPorAtendente ?? 20,
      timeoutSegundos: q.timeoutSegundos,
      teamId: q.teamId || "",
    });
    setEditId(q.id);
    setShowForm(true);
  }

  function toggleDia(v: number) {
    setForm((p) => ({
      ...p,
      diasSemana: p.diasSemana.includes(v) ? p.diasSemana.filter((d) => d !== v) : [...p.diasSemana, v],
    }));
  }

  async function save() {
    if (!form.nome.trim()) { alert("Nome obrigatório"); return; }
    try {
      if (editId) {
        const { nome, descricao, cor, ativa, horarioInicio, horarioFim, diasSemana, estrategiaAtribuicao, maxLeadsPorAtendente, timeoutSegundos, teamId } = form;
        await api.put(`/queues/${editId}`, {
          nome,
          descricao: descricao.trim() || null,
          cor,
          ativa,
          horarioInicio,
          horarioFim,
          diasSemana,
          estrategiaAtribuicao,
          maxLeadsPorAtendente,
          timeoutSegundos,
          teamId: teamId || null,
        });
      } else {
        await api.post("/queues", { ...form, descricao: form.descricao.trim() || null, teamId: form.teamId || null });
      }
      setShowForm(false);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao salvar fila");
    }
  }

  async function remove(q: Queue) {
    if (!confirm(`Excluir fila "${q.nome}"?`)) return;
    await api.delete(`/queues/${q.id}`).catch(() => null);
    await refresh();
  }

  function openMembers(q: Queue) {
    setMemberOf(q);
    const sel: Record<string, { profile: string; prioridade: number }> = {};
    for (const m of q.members) sel[m.user.id] = { profile: m.profile, prioridade: m.prioridade };
    setMemberSel(sel);
  }

  async function saveMembers() {
    if (!memberOf) return;
    const members = Object.entries(memberSel)
      .filter(([, v]) => v.profile)
      .map(([userId, v]) => ({ userId, profile: v.profile, prioridade: v.prioridade }));
    try {
      await api.put(`/queues/${memberOf.id}/members`, { members });
      setMemberOf(null);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao salvar agentes");
    }
  }

  const strategyLabel = (s: string) => {
    switch (s) {
      case "least_busy": return "Menos ocupado";
      case "skill_based": return "Por perfil/skill";
      case "manual": return "Manual";
      default: return "Round robin";
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl space-y-5">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Filas de atendimento</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Segmentize as conversas por time, perfil e estratégia de distribuição.
            </p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition"
          >
            <Plus size={16} /> Nova fila
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-card shadow-card p-5 space-y-4">
            <h2 className="font-semibold text-gray-700">{editId ? "Editar fila" : "Nova fila"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Nome da fila" value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input placeholder="Descrição (opcional)" value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <select value={form.teamId}
                onChange={(e) => setForm((p) => ({ ...p, teamId: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                <option value="">Grupo: nenhum</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <select value={form.estrategiaAtribuicao}
                onChange={(e) => setForm((p) => ({ ...p, estrategiaAtribuicao: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                {STRATEGIES.map((s) => <option key={s} value={s}>{strategyLabel(s)}</option>)}
              </select>
              <input placeholder="Horário início (08:00)" value={form.horarioInicio}
                onChange={(e) => setForm((p) => ({ ...p, horarioInicio: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input placeholder="Horário fim (18:00)" value={form.horarioFim}
                onChange={(e) => setForm((p) => ({ ...p, horarioFim: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input type="number" placeholder="Máx. leads por atendente" value={form.maxLeadsPorAtendente}
                onChange={(e) => setForm((p) => ({ ...p, maxLeadsPorAtendente: Number(e.target.value) }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input type="number" placeholder="Timeout (segundos)" value={form.timeoutSegundos}
                onChange={(e) => setForm((p) => ({ ...p, timeoutSegundos: Number(e.target.value) }))}
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
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Dias de funcionamento</p>
              <div className="flex gap-1.5 flex-wrap">
                {DIAS.map(({ v, label }) => {
                  const on = form.diasSemana.includes(v);
                  return (
                    <button key={v} onClick={() => toggleDia(v)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${on ? "bg-green-600 border-green-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-green-400"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.ativa}
                onChange={(e) => setForm((p) => ({ ...p, ativa: e.target.checked }))}
                className="accent-green-600" />
              Fila ativa
            </label>
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
          {queues.length === 0 && (
            <p className="text-sm text-gray-400 italic">Nenhuma fila cadastrada.</p>
          )}
          {queues.map((q) => (
            <div key={q.id} className="bg-white rounded-card shadow-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: q.cor || "#1B5E20" }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate flex items-center gap-2">
                      {q.nome}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${q.ativa ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {q.ativa ? "ativa" : "pausada"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {q.team?.nome || "sem grupo"} · {strategyLabel(q.estrategiaAtribuicao)}
                      {(q.horarioInicio || q.horarioFim) && ` · ${q.horarioInicio}–${q.horarioFim}`}
                      {q.abiertos != null && ` · ${q.abiertos} em aberto`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500"><Users size={13} className="inline mr-1" />{q.members.length}</span>
                  <button onClick={() => openMembers(q)} className="text-xs font-medium text-green-700 hover:bg-green-50 rounded-lg px-2 py-1.5 transition flex items-center gap-1">
                    <Users size={13} /> Agentes
                  </button>
                  <button onClick={() => startEdit(q)} className="text-gray-400 hover:text-blue-500" title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => remove(q)} className="text-gray-400 hover:text-red-500" title="Excluir"><Trash2 size={15} /></button>
                </div>
              </div>
              {q.members.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {q.members.slice(0, 8).map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">
                      {m.user.nome.split(" ")[0]}
                      <span className="text-[10px] uppercase text-gray-400">{m.profile}{m.prioridade > 0 ? ` ·${m.prioridade}` : ""}</span>
                    </span>
                  ))}
                  {q.members.length > 8 && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-500">+{q.members.length - 8}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {memberOf && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center pt-16 px-4" onClick={() => setMemberOf(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900 text-sm">Agentes — {memberOf.nome}</h3>
              <button onClick={() => setMemberOf(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-3 space-y-1">
              {users.filter((u) => u.ativo).map((u) => {
                const v = memberSel[u.id] || { profile: "", prioridade: 0 };
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{u.nome}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number" min={0} value={v.prioridade}
                        onChange={(e) => setMemberSel((p) => ({ ...p, [u.id]: { ...v, prioridade: Number(e.target.value) || 0 } }))}
                        placeholder="Prior."
                        title="Prioridade (maior primeiro)"
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none"
                      />
                      <select
                        value={v.profile}
                        onChange={(e) => setMemberSel((p) => ({ ...p, [u.id]: { profile: e.target.value, prioridade: v.prioridade } }))}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      >
                        <option value="">—</option>
                        {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={saveMembers} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                <Check size={15} /> Salvar agentes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}