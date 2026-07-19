"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface User { id: string; nome: string; email: string; nivel: string; ativo: boolean }

const BLANK = { nome: "", email: "", senha: "", nivel: "atendente" };

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const { data } = await api.get("/users");
    setUsers(data);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (editId) {
      await api.put(`/users/${editId}`, form);
    } else {
      await api.post("/users", form);
    }
    setForm(BLANK);
    setEditId(null);
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Desativar este usuário?")) return;
    await api.delete(`/users/${id}`);
    load();
  }

  function startEdit(u: User) {
    setForm({ nome: u.nome, email: u.email, senha: "", nivel: u.nivel });
    setEditId(u.id);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Equipe</h1>
        <button onClick={() => { setForm(BLANK); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
          <Plus size={16} /> Novo usuário
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-card shadow-card p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? "Editar usuário" : "Novo usuário"}</h2>
          <div className="grid grid-cols-2 gap-4">
            {["nome", "email"].map((f) => (
              <input key={f} placeholder={f} value={(form as any)[f]}
                onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            ))}
            <input placeholder="Senha (deixe vazio p/ manter)" type="password" value={form.senha}
              onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <select value={form.nivel} onChange={(e) => setForm((p) => ({ ...p, nivel: e.target.value }))}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
              {["admin", "supervisor", "atendente"].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">Salvar</button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition">Cancelar</button>
          </div>
        </div>
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
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(u)} className="text-gray-400 hover:text-blue-500"><Pencil size={15} /></button>
                    <button onClick={() => remove(u.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
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
