"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

interface Webhook { id: string; nome: string; url: string; eventos: string[]; ativo: boolean }

const EVENTS = ["lead.status_changed", "bia.toggled", "lead.new", "message.new"];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [form, setForm] = useState({ nome: "", url: "", eventos: [] as string[], secret: "" });
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const { data } = await api.get("/webhooks");
    setWebhooks(data);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    await api.post("/webhooks", form);
    setForm({ nome: "", url: "", eventos: [], secret: "" });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await api.delete(`/webhooks/${id}`);
    load();
  }

  function toggleEvento(e: string) {
    setForm((p) => ({
      ...p,
      eventos: p.eventos.includes(e) ? p.eventos.filter((x) => x !== e) : [...p.eventos, e],
    }));
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Webhooks</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
          <Plus size={16} /> Novo webhook
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-card shadow-card p-5 mb-6 space-y-3">
          <input placeholder="Nome" value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input placeholder="URL" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <input placeholder="Secret (opcional)" value={form.secret} onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Eventos</p>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map((ev) => (
                <button key={ev} onClick={() => toggleEvento(ev)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${form.eventos.includes(ev) ? "bg-green-600 text-white border-green-600" : "border-gray-200 text-gray-600"}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">Salvar</button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {webhooks.map((w) => (
          <div key={w.id} className="bg-white rounded-card shadow-card p-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-gray-900">{w.nome}</p>
              <p className="text-xs text-gray-400 mt-0.5">{w.url}</p>
              <div className="flex gap-1 mt-2">
                {w.eventos.map((e) => <span key={e} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{e}</span>)}
              </div>
            </div>
            <button onClick={() => remove(w.id)} className="text-gray-400 hover:text-red-500 mt-1"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
