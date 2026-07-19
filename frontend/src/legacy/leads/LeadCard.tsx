"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Trash2, UserCheck, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
import { formatIdentifier } from "@/lib/utils";
import ChannelBadge from "@/components/common/ChannelBadge";
import ScoreBadge from "./ScoreBadge";
import SlaTimer from "./SlaTimer";
import type { Lead } from "@/hooks/useLeads";

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-yellow-100 text-yellow-700",
  aguardando: "bg-gray-100 text-gray-600",
  convertido: "bg-green-100 text-green-700",
  perdido: "bg-red-100 text-red-700",
  em_followup: "bg-orange-100 text-orange-700",
  arquivado: "bg-gray-200 text-gray-500",
  reativado: "bg-teal-100 text-teal-700",
};

export default function LeadCard({ lead, onDelete }: { lead: Lead; onDelete?: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assuming, setAssuming] = useState(false);

  async function handleAssume(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || assuming) return;
    setAssuming(true);
    try {
      await api.post(`/leads/${lead.id}/assign`, { atendenteId: user.id });
      router.push(`/chats/${lead.id}`);
    } finally {
      setAssuming(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await api.delete(`/leads/${lead.id}`);
    setConfirmDelete(false);
    onDelete?.();
  }

  return (
    <div
      className="bg-white rounded-card shadow-card p-4 hover:shadow-md transition cursor-pointer relative"
      onClick={() => router.push(`/chats/${lead.id}`)}
    >
      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div
          className="absolute inset-0 bg-white rounded-card z-10 flex flex-col items-center justify-center gap-3 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertTriangle size={24} className="text-red-500" />
          <p className="text-sm font-medium text-gray-800 text-center">Deletar este lead?</p>
          <p className="text-xs text-gray-400 text-center">Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Deletar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ChannelBadge canal={lead.canal || lead.canalMensagem || ""} size="sm" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{lead.nome || "Lead sem nome"}</p>
            {lead.identifierCanal && (
              <p className="text-xs text-gray-400">{formatIdentifier(lead.canal, lead.identifierCanal)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ScoreBadge score={lead.score} />
          {user?.nivel === "admin" && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="p-1 text-gray-300 hover:text-red-500 transition rounded"
              title="Deletar lead"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.statusPipeline] || "bg-gray-100 text-gray-600"}`}>
          {lead.statusPipeline.replace(/_/g, " ")}
        </span>
        {lead.statusPipeline === "novo" && (
          <SlaTimer criadoEm={lead.criadoEm} />
        )}
      </div>

      <div className="mt-2 flex gap-1 flex-wrap">
        {lead.tags?.slice(0, 3).map((tag) => (
          <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
            {tag}
          </span>
        ))}
        {lead.biaAtiva && (
          <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">🤖 Bia</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(lead.atualizadoEm), { addSuffix: true, locale: ptBR })}
        </p>
        {lead.statusPipeline === "novo" && user && (
          <button
            onClick={handleAssume}
            disabled={assuming}
            className="flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            <UserCheck size={12} />
            {assuming ? "..." : "Assumir"}
          </button>
        )}
      </div>
    </div>
  );
}
