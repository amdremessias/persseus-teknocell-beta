"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";

const DEFAULT_TEMPLATE = "*{nome}*\n\n{mensagem}";

export default function AtendimentoSettingsPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/settings").then((res) => {
      const s = res.data;
      if (s.atendente_signature_enabled !== undefined) {
        setEnabled(s.atendente_signature_enabled !== "false");
      }
      if (s.atendente_signature_template) {
        setTemplate(s.atendente_signature_template);
      }
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await api.put("/api/settings", {
      atendente_signature_enabled: enabled ? "true" : "false",
      atendente_signature_template: template,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const previewText = enabled
    ? template
        .replace("{nome}", user?.nome || "Atendente")
        .replace("{mensagem}", "Olá! Como posso ajudar?")
    : "Olá! Como posso ajudar?";

  if (loading) return <div className="p-6 text-sm text-gray-400">Carregando...</div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-xl space-y-5">
        <div className="mb-2">
          <h1 className="text-xl font-bold text-gray-900">Atendimento</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Configurações de assinatura automática nas mensagens enviadas pelos atendentes.
          </p>
        </div>

        <div className="bg-white rounded-card shadow-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Assinatura do atendente</h2>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 font-medium">Ativar assinatura</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Adiciona o nome do atendente automaticamente em cada mensagem enviada pelo CRM.
              </p>
            </div>
            <button
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-green-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Template */}
          {enabled && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Template
              </label>
              <p className="text-xs text-gray-400">
                Use <code className="bg-gray-100 px-1 rounded">{"{nome}"}</code> para o nome do atendente e{" "}
                <code className="bg-gray-100 px-1 rounded">{"{mensagem}"}</code> para o texto enviado.
              </p>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={DEFAULT_TEMPLATE}
              />
            </div>
          )}

          {/* Preview */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Preview
            </span>
            <pre className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
              {previewText}
            </pre>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition"
            >
              {saved ? "Salvo ✓" : saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
