"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Check, KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";

interface User {
  id: string;
  nome: string;
  email: string;
  nivel: string;
  ativo: boolean;
  permissions?: string[];
  lastPasswordChange?: string | null;
}

interface Permission {
  key: string;
  label: string;
}

const NIVELS = ["admin", "supervisor", "atendente"];
const BLANK = { nome: "", email: "", senha: "", nivel: "atendente", ativo: true, permissions: [] as string[] };

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.nivel === "admin";
  const [users, setUsers] = useState<User[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [form, setForm] = useState<ReturnType<typeof blankForm>>(blankForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Troca de própria senha
  const [pwForm, setPwForm] = useState({ senhaAtual: "", novaSenha: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  function blankForm() {
    return { ...BLANK, permissions: [] as string[] };
  }

  const load = useCallback(async () => {
    const { data } = await api.get("/users");
    setUsers(Array.isArray(data) ? data : data?.users || []);
    const per = await api.get("/users/permissions").catch(() => null);
    setPerms(per?.data?.permissions || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setForm(blankForm());
    setEditId(null);
    setShowForm(true);
  }

  function startEdit(u: User) {
    setForm({ nome: u.nome, email: u.email, senha: "", nivel: u.nivel, ativo: u.ativo, permissions: u.permissions?.length ? u.permissions : [] });
    setEditId(u.id);
    setShowForm(true);
  }

  async function save() {
    if (!form.nome.trim() || !form.email.trim()) { alert("nome e email obrigatórios"); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/users/${editId}`, { ...form, senha: form.senha || undefined });
      } else {
        await api.post("/users", form);
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Desativar usuário "${u.nome}"?`)) return;
    await api.delete(`/users/${u.id}`).catch(() => null);
    await load();
  }

  async function resetSenha(u: User) {
    const nova = prompt(`Definir nova senha para ${u.email}:`);
    if (!nova || nova.length < 6) { alert("senha precisa de ao menos 6 caracteres"); return; }
    try {
      await api.post(`/users/${u.id}/reset-password`, { senha: nova });
      alert("Senha redefinida!");
    } catch (err: any) {
      alert(err.response?.data?.error || "erro ao redefinir senha");
    }
  }

  async function changeMyPassword() {
    if (pwForm.novaSenha.length < 6) { setPwMsg("Nova senha precisa de ao menos 6 caracteres"); return; }
    setPwMsg(null);
    try {
      await api.post("/users/change-password", pwForm);
      setPwForm({ senhaAtual: "", novaSenha: "" });
      setPwMsg("Senha alterada com sucesso!");
    } catch (err: any) {
      setPwMsg(err.response?.data?.error || "Falha ao alterar senha");
    }
  }

  function togglePerm(key: string) {
    setForm((p) => ({
      ...p,
      permissions: p.permissions.includes(key)
        ? p.permissions.filter((k) => k !== key)
        : [...p.permissions, key],
    }));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl space-y-5">
        <div className="mb-2">
          <h1 className="text-xl font-bold text-gray-900">Equipe</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Crie e edite usuários, controle permissões por perfil e gerencie o acesso ao CRM.
          </p>
        </div>

        {!isAdmin && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-card">
            Você não é administrador — a lista é somente leitura para o seu perfil.
          </div>
        )}

        {/* Minha senha */}
        <div className="bg-white rounded-card shadow-card p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Lock size={15} className="text-green-600" /> Altere sua senha
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="password"
              placeholder="Senha atual"
              value={pwForm.senhaAtual}
              onChange={(e) => setPwForm((p) => ({ ...p, senhaAtual: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <input
              type="password"
              placeholder="Nova senha"
              value={pwForm.novaSenha}
              onChange={(e) => setPwForm((p) => ({ ...p, novaSenha: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <button
            onClick={changeMyPassword}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
          >
            <KeyRound size={15} /> Trocar senha
          </button>
          {pwMsg && <p className="text-xs text-gray-500">{pwMsg}</p>}
        </div>

        {isAdmin && (
          <>
            <button
              onClick={startNew}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition"
            >
              <Plus size={16} /> Novo usuário
            </button>

            {showForm && (
              <div className="bg-white rounded-card shadow-card p-5 space-y-4">
                <h2 className="font-semibold text-gray-700">{editId ? "Editar usuário" : "Novo usuário"}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Nome" value={form.nome}
                    onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <input placeholder="Email" value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <input placeholder="Senha (vazio mantém a atual ao editar)" type="password" value={form.senha}
                    onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <select value={form.nivel}
                    onChange={(e) => setForm((p) => ({ ...p, nivel: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                    {NIVELS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={form.ativo}
                      onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                      className="accent-green-600" />
                    Usuário ativo
                  </label>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Permissões</p>
                  {form.nivel === "admin" ? (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-green-600" />
                      Administradores têm todas as permissões.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {perms.map((p) => {
                        const active = form.permissions.includes(p.key);
                        return (
                          <label key={p.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition cursor-pointer ${active ? "bg-green-50 border-green-300 text-green-800" : "border-gray-100 text-gray-600 hover:bg-gray-50"}`}>
                            <input type="checkbox" checked={active}
                              onChange={() => togglePerm(p.key)}
                              className="accent-green-600" />
                            {p.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={save} disabled={saving}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                    <Check size={15} /> Salvar
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="flex items-center gap-1.5 text-gray-500 px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition">
                    <X size={15} /> Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="bg-white rounded-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Nome", "Email", "Nível", "Status", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3"><span className="capitalize">{u.nivel}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.ativo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(u)} className="text-gray-400 hover:text-blue-500" title="Editar"><Pencil size={15} /></button>
                        <button onClick={() => resetSenha(u)} className="text-gray-400 hover:text-amber-500" title="Redefinir senha"><KeyRound size={15} /></button>
                        <button onClick={() => remove(u)} className="text-gray-400 hover:text-red-500" title="Desativar"><Trash2 size={15} /></button>
                      </div>
                    ) : (
                      u.id === user?.id && (
                        <span className="text-xs text-gray-400">Você</span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}