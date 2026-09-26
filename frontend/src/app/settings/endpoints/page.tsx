"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, AlertTriangle, Tag, Zap, MessageCircle } from "lucide-react";

// Base derivada do build — mostra o CORPO real do ambiente em uso (local = backend local; prod = dominio real)
const apiBase: string = process.env.NEXT_PUBLIC_API_URL || "/api";
const BASE: string = apiBase.replace(/\/+$/, "").replace(/\/api$/i, "");

const ENDPOINTS = [
  {
    title: "MercadoPhone → CRM (entrada principal)",
    description: "Configure esta URL no painel MercadoPhone como Webhook Principal. Não altere sem necessidade.",
    method: "POST",
    url: `${BASE}/api/webhooks/whatsapp`,
    auth: null,
    warning: "Esta URL já está configurada no MercadoPhone. Não altere a menos que esteja migrando o webhook.",
    payload: null,
  },
  {
    title: "BIA → CRM (resposta da IA)",
    description: "Endpoint que o n8n chama após processar a mensagem do cliente. Requer header X-Bia-Secret.",
    method: "POST",
    url: `${BASE}/api/webhooks/bia-response`,
    auth: "Header: X-Bia-Secret: <valor de BIA_SECRET no .env>",
    warning: null,
    payload: `{
  "lead_id": "cmp...",
  "respostas": [
    { "texto": "Olá! Como posso ajudar?" },
    { "texto": "Temos ótimas opções disponíveis." }
  ],
  "metadata": { "workflow": "bia-v3" }
}`,
  },
  {
    title: "Instagram → CRM",
    description: "Webhook Meta para mensagens do Instagram Direct. Requer META_APP_SECRET + META_VERIFY_TOKEN.",
    method: "POST",
    url: `${BASE}/api/webhooks/instagram`,
    auth: "Header: X-Hub-Signature-256 (gerado pelo Meta)",
    warning: null,
    payload: null,
  },
  {
    title: "Messenger → CRM",
    description: "Webhook Meta para mensagens do Facebook Messenger.",
    method: "POST",
    url: `${BASE}/api/webhooks/messenger`,
    auth: "Header: X-Hub-Signature-256 (gerado pelo Meta)",
    warning: null,
    payload: null,
  },
];

export default function EndpointsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-2xl space-y-5">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900">Endpoints</h1>
        <p className="text-sm text-gray-400 mt-0.5">URLs de entrada e saída do CRM. Apenas referência — configurações reais ficam no servidor.</p>
      </div>

      {/* Atalhos pras outras settings */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/settings/atendimento" className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition flex flex-col gap-1.5">
          <MessageCircle size={18} className="text-green-600" />
          <span className="text-sm font-semibold text-gray-800">Atendimento</span>
          <span className="text-xs text-gray-500">Assinatura automática</span>
        </Link>
        <Link href="/settings/tags" className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition flex flex-col gap-1.5">
          <Tag size={18} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Tags</span>
          <span className="text-xs text-gray-500">Categorias coloridas</span>
        </Link>
        <Link href="/settings/atalhos" className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition flex flex-col gap-1.5">
          <Zap size={18} className="text-yellow-600" />
          <span className="text-sm font-semibold text-gray-800">Atalhos</span>
          <span className="text-xs text-gray-500">Respostas rápidas</span>
        </Link>
      </div>

      {/* Seção: Integrações */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Integrações</h2>
      </div>

      {ENDPOINTS.map((ep) => (
        <div key={ep.url} className="bg-white rounded-card shadow-card p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{ep.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{ep.description}</p>
          </div>

          {ep.warning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">{ep.warning}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded shrink-0">
              {ep.method}
            </span>
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 break-all select-all">
              {ep.url}
            </code>
            <button
              onClick={() => copy(ep.url)}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition"
              title="Copiar URL"
            >
              {copied === ep.url
                ? <><Check size={13} className="text-green-600" /> Copiado</>
                : <><Copy size={13} /> Copiar</>
              }
            </button>
          </div>

          {ep.auth && (
            <div>
              <span className="text-xs font-medium text-gray-500">Autenticação</span>
              <code className="block mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700">
                {ep.auth}
              </code>
            </div>
          )}

          {ep.payload && (
            <div>
              <span className="text-xs font-medium text-gray-500">Payload de exemplo</span>
              <pre className="mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 overflow-x-auto leading-relaxed">
                {ep.payload}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}
