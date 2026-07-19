"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

interface Template { id: string; nome: string; texto: string; canal: string; aprovadoMeta: boolean }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ nome: "", texto: "", canal: "whatsapp" });
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const { data } = await api.get("/templates");
    setTemplates(data);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    await api.post("/templates", form);
    setForm({ nome: "", texto: "", canal: "whatsapp" });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await api.delete(`/templates/${id}`);
    load();
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Templates Meta</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
          <Plus size={16} /> Novo template
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-card shadow-card p-5 mb-6 space-y-3">
          <input placeholder="Nome do template" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <textarea placeholder="Texto (use {{1}}, {{2}} para variáveis)" value={form.texto}
            onChange={(e) => setForm((p) => ({ ...p, texto: e.target.value }))} rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          <select value={form.canal} onChange={(e) => setForm((p) => ({ ...p, canal: e.target.value }))}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none">
            {["whatsapp", "facebook", "instagram"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-3">
            <button onClick={save} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">Salvar</button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-card shadow-card p-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-gray-900">{t.nome}</p>
                {t.aprovadoMeta && <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">✓ Aprovado Meta</span>}
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.texto}</p>
              <p className="text-xs text-gray-400 mt-1 capitalize">{t.canal}</p>
            </div>
            <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
