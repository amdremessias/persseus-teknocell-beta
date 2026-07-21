"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { X, Clock, Trash2 } from "lucide-react";

interface TemplateItem {
  id: string;
  nome: string;
  texto: string;
  variaveis: string[];
  canal: string;
}

interface ScheduledItem {
  id: string;
  tipo: "texto" | "template";
  texto: string | null;
  templateNome: string | null;
  scheduledAt: string;
  status: "pendente" | "enviado" | "falhou" | "cancelado";
  erro: string | null;
}

interface Props {
  leadId: string;
  canal: string;
  onClose: () => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pendente: { label: "Agendado", color: "bg-blue-50 text-blue-700" },
  enviado: { label: "Enviado", color: "bg-green-50 text-green-700" },
  falhou: { label: "Falhou", color: "bg-red-50 text-red-700" },
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleMessageModal({ leadId, canal, onClose }: Props) {
  const [list, setList] = useState<ScheduledItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const supportsTemplate = canal === "whatsapp";
  const [tipo, setTipo] = useState<"texto" | "template">(supportsTemplate ? "template" : "texto");
  const [texto, setTexto] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  const minDate = toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000));
  const [scheduledAt, setScheduledAt] = useState(minDate);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data } = await api.get(`/leads/${leadId}/scheduled-messages`);
      setList(data || []);
    } catch {
      setList([]);
    } finally {
      setLoadingList(false);
    }
  }, [leadId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (tipo === "template" && supportsTemplate && templates.length === 0) {
      setTemplatesLoading(true);
      api.get("/waba-templates")
        .then(({ data }) => setTemplates(data as TemplateItem[]))
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false));
    }
  }, [tipo, supportsTemplate, templates.length]);

  async function handleCreate() {
    if (creating) return;
    setError(null);

    if (tipo === "texto" && !texto.trim()) { setError("Digite a mensagem"); return; }
    if (tipo === "template" && !selectedTemplate) { setError("Escolha um template"); return; }
    if (tipo === "template" && selectedTemplate) {
      const faltando = selectedTemplate.variaveis.filter((v) => !(templateVars[v] || "").trim());
      if (faltando.length > 0) {
        setError(`Preencha o valor da variável {${faltando.join("}, {")}} do template`);
        return;
      }
    }

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError("Escolha uma data e hora no futuro");
      return;
    }

    setCreating(true);
    try {
      await api.post(`/leads/${leadId}/scheduled-messages`, {
        tipo,
        texto: tipo === "texto" ? texto.trim() : undefined,
        templateNome: tipo === "template" ? selectedTemplate?.nome : undefined,
        templateVariaveis: tipo === "template" ? templateVars : undefined,
        scheduledAt: when.toISOString(),
      });
      setTexto("");
      setSelectedTemplate(null);
      setTemplateVars({});
      await fetchList();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Não foi possível agendar a mensagem");
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel(id: string) {
    await api.delete(`/scheduled-messages/${id}`).catch(() => null);
    fetchList();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <Clock size={16} className="text-green-600" />
            Agendar mensagem
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!loadingList && list.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500">Agendamentos</p>
              <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {list.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.pendente;
                  return (
                    <li key={item.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", meta.color)}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {new Date(item.scheduledAt).toLocaleString("pt-BR", {
                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 truncate mt-0.5">
                          {item.tipo === "template" ? `Template: ${item.templateNome}` : item.texto}
                        </p>
                        {item.status === "falhou" && item.erro && (
                          <p className="text-[11px] text-red-500 mt-0.5 truncate">{item.erro}</p>
                        )}
                      </div>
                      {item.status === "pendente" && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="shrink-0 text-gray-300 hover:text-red-500"
                          title="Cancelar agendamento"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className={cn("space-y-2.5", list.length > 0 && "pt-1 border-t border-gray-100")}>
            <p className="text-xs font-medium text-gray-500 pt-2">Novo agendamento</p>

            {supportsTemplate && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTipo("template")}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-lg border transition",
                    tipo === "template" ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  Template
                </button>
                <button
                  onClick={() => setTipo("texto")}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-lg border transition",
                    tipo === "texto" ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  Texto livre
                </button>
              </div>
            )}

            {tipo === "texto" ? (
              <>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Mensagem..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <p className="text-[11px] text-gray-400">
                  Só é entregue se a janela de 24h ainda estiver aberta no horário agendado.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedTemplate?.id || ""}
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value) || null;
                    setSelectedTemplate(t);
                    setTemplateVars({});
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  <option value="">{templatesLoading ? "Carregando templates..." : "Selecione um template"}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
                {selectedTemplate && (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 space-y-2">
                    <p className="text-xs text-gray-500 whitespace-pre-wrap">{selectedTemplate.texto}</p>
                    {selectedTemplate.variaveis.map((v) => (
                      <div key={v}>
                        <label className="text-[11px] font-medium text-gray-600 block mb-0.5">{`{${v}}`}</label>
                        <input
                          type="text"
                          value={templateVars[v] || ""}
                          onChange={(e) => setTemplateVars((prev) => ({ ...prev, [v]: e.target.value }))}
                          placeholder={`Valor para {${v}}`}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <input
              type="datetime-local"
              value={scheduledAt}
              min={minDate}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-xl transition"
            >
              {creating ? "Agendando..." : "Agendar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
