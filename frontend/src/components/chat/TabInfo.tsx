"use client";

import { CHANNEL_META } from "@/lib/utils";

interface Props {
  lead: any;
  messageCount: number;
  firstMessageAt: string | null;
  lastActivityAt: string | null;
  tagPills?: { id: string; nome: string; cor: string }[];
  onEditContact?: () => void;
}

function row(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 break-words">{value || "—"}</span>
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR");
}

export default function TabInfo({ lead, messageCount, firstMessageAt, lastActivityAt, tagPills = [], onEditContact }: Props) {
  const canalLabel = CHANNEL_META[lead.canal]?.label || lead.canal;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        {row("Telefone", lead.telefone)}
        {row("Canal", canalLabel)}
        {row("Identifier", lead.identifierCanal)}
        {row("Primeira mensagem", fmtDate(firstMessageAt))}
        {row("Última atividade", fmtDate(lastActivityAt))}
        {row("Total de mensagens", messageCount)}
        {row("Bia ativa", lead.biaAtiva ? "Sim" : "Não")}
        {row("Atendente atual", lead.atendente?.nome)}
        {row("Status pipeline", lead.statusPipeline)}
        {row("Score", lead.score)}
        {row("Tags",
          tagPills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tagPills.map((t) => (
                <span
                  key={t.id}
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                  style={{ backgroundColor: t.cor }}
                >
                  {t.nome}
                </span>
              ))}
            </div>
          ) : null
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        <button
          onClick={onEditContact}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50 transition"
        >
          Editar contato
        </button>
      </div>
    </div>
  );
}
