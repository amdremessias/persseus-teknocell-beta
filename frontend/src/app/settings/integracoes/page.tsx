"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Eye, EyeOff, Lock, Bot, Brain, Smartphone, Instagram, MessageCircle, Facebook, Music2, Check, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface SettingItem {
  key: string;
  defined: boolean;
  secret: boolean;
  value: string;   // se secret, vem mascarado
  source: "db" | "env" | null;
}

type FieldType = "text" | "password" | "number" | "select" | "url";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "bia",
    title: "Bia (n8n)",
    description: "Controla o despacho automático de mensagens para o workflow Bia v3 no n8n.",
    icon: Bot,
    fields: [
      { key: "BIA_MODE", label: "Modo da Bia", type: "select", options: [
        { value: "observer", label: "Observer (apenas observa)" },
        { value: "active", label: "Active (dispara automaticamente)" },
      ], help: "Em observer, mensagens não disparam Bia até atendente assumir." },
      { key: "BIA_WEBHOOK_URL", label: "Webhook URL do n8n", type: "url", placeholder: "https://n8n.teknoscel.shop/webhook/bia-processar" },
      { key: "BIA_SECRET", label: "Secret (X-Bia-Secret)", type: "password", help: "Enviado no header X-Bia-Secret para o n8n autenticar a chamada." },
      { key: "BIA_GROUPING_DELAY_MS", label: "Agrupar mensagens (ms)", type: "number", placeholder: "8000", help: "Janela de espera antes de disparar Bia. Mensagens consecutivas resetam o timer." },
      { key: "BIA_INTER_MESSAGE_DELAY_MS", label: "Delay entre respostas (ms)", type: "number", placeholder: "2000" },
      { key: "N8N_BIA_URL", label: "URL n8n (handoff Assumir/Devolver)", type: "url", placeholder: "https://n8n.teknoscel.shop/webhook/bia-teknos" },
    ],
  },
  {
    id: "anthropic",
    title: "Anthropic / Claude",
    description: "Sugestões de resposta inteligente no chat (botão ⚡ no atendimento).",
    icon: Brain,
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "API Key", type: "password", placeholder: "sk-ant-..." },
      { key: "CLAUDE_MODEL", label: "Modelo", type: "text", placeholder: "claude-sonnet-4-20250514" },
    ],
  },
  {
    id: "mercadophone",
    title: "MercadoPhone (WhatsApp)",
    description: "Credenciais do provedor MercadoPhone usado para envio de mensagens WhatsApp.",
    icon: Smartphone,
    fields: [
      { key: "MERCADOPHONE_URL", label: "Endpoint de envio", type: "url", placeholder: "https://exclusivoapi.mercadophone.tech/api/messages/sendOfficialData" },
      { key: "MERCADOPHONE_TOKEN", label: "Bearer Token (envio dentro da janela 24h)", type: "password" },
      { key: "OUTGOING_WEBHOOK_URL", label: "Webhook de saída", type: "url", help: "Notifica MercadoPhone quando o atendente envia mensagem." },
      { key: "OUTGOING_WEBHOOK_SECRET", label: "Secret do webhook de saída", type: "password" },
    ],
  },
  {
    id: "mercadophone-api",
    title: "MercadoPhone API — Disparo Proativo",
    description: "Configurações para disparo de template HSM a leads fora da janela 24h (quiz iPhone). O JWT é gerenciado em Configurações → MercadoPhone API JWT.",
    icon: Smartphone,
    fields: [
      { key: "MERCADOPHONE_API_URL", label: "Base URL da API", type: "url", placeholder: "https://exclusivoapi.mercadophone.tech" },
      { key: "MERCADOPHONE_WHATSAPP_ID", label: "WhatsApp ID (Teknos WABA)", type: "text", placeholder: "185" },
      { key: "MERCADOPHONE_QUEUE_ID", label: "Queue ID (Atendimento Geral)", type: "text", placeholder: "85" },
      { key: "MERCADOPHONE_USER_ID", label: "User ID (responsável)", type: "text", placeholder: "161" },
    ],
  },
  {
    id: "instagram",
    title: "Instagram (Meta)",
    description: "Direct Messages do Instagram. Requer página vinculada à conta Meta Business.",
    icon: Instagram,
    fields: [
      { key: "META_GRAPH_TOKEN", label: "Graph API Token (página)", type: "password", placeholder: "EAAB..." },
      { key: "IG_PAGE_ID", label: "Page ID do Instagram", type: "text" },
      { key: "META_VERIFY_TOKEN_INSTAGRAM", label: "Verify Token (webhook)", type: "password", help: "Definido no painel da Meta — o CRM responde a este token no GET /api/webhooks/instagram." },
      { key: "META_APP_SECRET_INSTAGRAM", label: "App Secret", type: "password", help: "Usado pra validar X-Hub-Signature-256." },
    ],
  },
  {
    id: "messenger",
    title: "Messenger (Meta)",
    description: "Mensagens do Facebook Messenger via página oficial.",
    icon: MessageCircle,
    fields: [
      { key: "META_MESSENGER_TOKEN", label: "Page Access Token", type: "password" },
      { key: "MESSENGER_PAGE_ID", label: "Page ID do Messenger", type: "text" },
      { key: "META_VERIFY_TOKEN_MESSENGER", label: "Verify Token (webhook)", type: "password" },
    ],
  },
  {
    id: "facebook",
    title: "Facebook (Meta)",
    description: "Posts e comentários do Facebook (opcional).",
    icon: Facebook,
    fields: [
      { key: "METAFB_TOKEN", label: "Page Access Token", type: "password" },
    ],
  },
  {
    id: "tiktok",
    title: "TikTok",
    description: "Direct messages do TikTok (depende de API beta).",
    icon: Music2,
    fields: [
      { key: "TIKTOK_TOKEN", label: "Access Token", type: "password" },
    ],
  },
];

export default function IntegracoesPage() {
  const [items, setItems] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["bia"]));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pwModal, setPwModal] = useState<{ sectionId: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/integrations/settings");
      setItems(data.items || []);
      setForbidden(false);
    } catch (err: any) {
      if (err.response?.status === 403) setForbidden(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getDraftValue(field: FieldDef): string {
    if (field.key in draft) return draft[field.key];
    const item = itemMap.get(field.key);
    // Se for secret, NAO pre-popula o input (evita salvar o valor mascarado).
    if (field.type === "password" || item?.secret) return "";
    return item?.value || "";
  }

  function setDraftValue(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function getSectionDirty(section: SectionDef) {
    return section.fields.some((f) => f.key in draft);
  }

  function buildSectionUpdates(section: SectionDef) {
    const updates: Record<string, string> = {};
    for (const f of section.fields) {
      if (f.key in draft) updates[f.key] = draft[f.key];
    }
    return updates;
  }

  async function savePage(sectionId: string, password: string) {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const updates = buildSectionUpdates(section);
    if (Object.keys(updates).length === 0) return;
    try {
      await api.put("/integrations/settings", { password, updates });
      // Limpa drafts dessa seção
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(updates)) delete next[k];
        return next;
      });
      setPwModal(null);
      await load();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || "Erro ao salvar");
    }
  }

  if (forbidden) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-2xl">
          <div className="bg-red-50 border border-red-200 rounded-card p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">Acesso restrito</p>
              <p className="text-sm text-red-600 mt-1">Apenas administradores podem acessar Integrações.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl space-y-4">
        <div className="mb-2">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Lock size={18} className="text-gray-500" />
            Integrações
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Tokens e endpoints externos. Cada alteração pede a senha do admin. Campos vazios caem no fallback do arquivo <code className="bg-gray-100 px-1 rounded">.env</code>.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          SECTIONS.map((section) => {
            const Icon = section.icon;
            const open = openSections.has(section.id);
            const dirty = getSectionDirty(section);
            return (
              <div key={section.id} className="bg-white rounded-card shadow-card overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition text-left"
                >
                  <Icon size={18} className="text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800">{section.title}</p>
                    <p className="text-xs text-gray-500 truncate">{section.description}</p>
                  </div>
                  {dirty && <span className="text-[10px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded">não salvo</span>}
                  {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </button>

                {open && (
                  <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-100">
                    {section.fields.map((field) => {
                      const item = itemMap.get(field.key);
                      const value = getDraftValue(field);
                      const isReveal = revealed.has(field.key);
                      const inputType = field.type === "password" && !isReveal ? "password" : (field.type === "number" ? "number" : "text");
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="flex items-center justify-between text-xs font-medium text-gray-600">
                            <span>{field.label}</span>
                            <span className="text-[10px] text-gray-400 font-normal">
                              {field.key}
                              {item?.source === "db" && <span className="ml-2 bg-green-100 text-green-700 px-1.5 rounded">DB</span>}
                              {item?.source === "env" && <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 rounded">ENV</span>}
                              {!item?.defined && <span className="ml-2 bg-gray-100 text-gray-500 px-1.5 rounded">vazio</span>}
                            </span>
                          </label>

                          {field.type === "select" ? (
                            <select
                              value={value}
                              onChange={(e) => setDraftValue(field.key, e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                            >
                              <option value="">— manter atual{item?.defined ? ` (${item.value || "definido"})` : ""} —</option>
                              {field.options?.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="relative">
                              <input
                                type={inputType}
                                value={value}
                                onChange={(e) => setDraftValue(field.key, e.target.value)}
                                placeholder={
                                  item?.secret && item.defined
                                    ? `Atual: ${item.value} (digite pra substituir)`
                                    : field.placeholder
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 pr-10"
                              />
                              {field.type === "password" && (
                                <button
                                  type="button"
                                  onClick={() => setRevealed((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(field.key)) next.delete(field.key);
                                    else next.add(field.key);
                                    return next;
                                  })}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                >
                                  {isReveal ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                          )}

                          {field.help && <p className="text-[11px] text-gray-500">{field.help}</p>}
                        </div>
                      );
                    })}

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => setPwModal({ sectionId: section.id })}
                        disabled={!dirty}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
                      >
                        <Lock size={14} />
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {pwModal && (
        <PasswordModal
          onConfirm={(pw) => savePage(pwModal.sectionId, pw)}
          onClose={() => setPwModal(null)}
        />
      )}
    </div>
  );
}

interface PwProps {
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}

function PasswordModal({ onConfirm, onClose }: PwProps) {
  const [pw, setPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!pw || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(pw);
    } catch (err: any) {
      setError(err.message || "Senha incorreta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-[400px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Lock size={20} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Confirme sua senha</h3>
            <p className="text-sm text-gray-600 mt-1">
              Alterar integrações exige re-confirmação da senha do admin logado.
            </p>
          </div>
        </div>

        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Sua senha"
          autoFocus
          className="w-full mt-4 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />

        {error && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!pw || submitting}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <Check size={14} />
            {submitting ? "Validando..." : "Confirmar e salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
