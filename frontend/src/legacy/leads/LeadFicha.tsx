"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, X } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
import { scoreEmoji, channelIcon } from "@/lib/utils";
import type { Lead } from "@/hooks/useLeads";

const STATUS_OPTIONS = [
  "novo",
  "em_atendimento",
  "aguardando",
  "convertido",
  "perdido",
  "em_followup",
  "arquivado",
  "reativado",
];

interface Props {
  lead: Lead & { observacoes?: string; interesse?: string; modeloDesejado?: string; faixaInvestimento?: string; vaiTrocar?: boolean; fonteCampanha?: string };
  onUpdate: () => void;
}

export default function LeadFicha({ lead, onUpdate }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [toggling, setToggling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPerdaModal, setShowPerdaModal] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState("");

  async function toggleBia() {
    setToggling(true);
    try {
      await api.post(`/leads/${lead.id}/bia`);
      onUpdate();
    } finally {
      setToggling(false);
    }
  }

  async function setStatus(status: string) {
    if (status === "perdido") {
      setShowPerdaModal(true);
      return;
    }
    await api.post(`/leads/${lead.id}/status`, { status });
    onUpdate();
  }

  async function confirmPerda() {
    await api.post(`/leads/${lead.id}/status`, { status: "perdido", motivo_perda: motivoPerda });
    setShowPerdaModal(false);
    setMotivoPerda("");
    onUpdate();
  }

  async function deleteLead() {
    await api.delete(`/leads/${lead.id}`);
    router.push("/leads");
  }

  return (
    <aside className="w-[260px] shrink-0 bg-white border-l border-gray-100 overflow-y-auto p-4 space-y-4">
      {/* Motivo perda modal */}
      {showPerdaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-80 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Motivo da perda</h3>
              <button onClick={() => setShowPerdaModal(false)}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Explique por que este lead foi perdido para disparar o follow-up automático da Bia.</p>
            <textarea
              value={motivoPerda}
              onChange={(e) => setMotivoPerda(e.target.value)}
              placeholder="Ex: Não tem condições agora, preferiu outra loja..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowPerdaModal(false)}
                className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPerda}
                className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700"
              >
                Confirmar perda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-72 shadow-xl space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertTriangle size={32} className="text-red-500" />
              <h3 className="font-semibold text-gray-900">Deletar lead?</h3>
              <p className="text-xs text-gray-400">Todo o histórico de mensagens será removido. Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={deleteLead}
                className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700"
              >
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{channelIcon(lead.canalMensagem || lead.canalOrigem || "")}</span>
            <h2 className="font-bold text-gray-900 text-lg">{lead.nome || "Lead sem nome"}</h2>
          </div>
          {user?.nivel === "admin" && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-gray-300 hover:text-red-500 transition rounded-lg hover:bg-red-50"
              title="Deletar lead"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {lead.telefone && <p className="text-sm text-gray-500">{lead.telefone}</p>}
        {lead.email && <p className="text-sm text-gray-500">{lead.email}</p>}
      </div>

      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
        <span className="text-sm font-medium text-gray-600">Score</span>
        <span className="font-bold text-lg">{scoreEmoji(lead.score)} {lead.score}</span>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
        <select
          value={lead.statusPipeline}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
        <div>
          <p className="text-sm font-medium text-gray-700">🤖 Bia (IA)</p>
          <p className="text-xs text-gray-400">{lead.biaAtiva ? "Ativa" : "Desativada"}</p>
        </div>
        <button
          onClick={toggleBia}
          disabled={toggling}
          className={`relative w-12 h-6 rounded-full transition ${lead.biaAtiva ? "bg-purple-500" : "bg-gray-300"}`}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${lead.biaAtiva ? "left-7" : "left-1"}`} />
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ficha do Lead</h3>
        {lead.interesse && <Row label="Interesse" value={lead.interesse} />}
        {lead.modeloDesejado && <Row label="Modelo desejado" value={lead.modeloDesejado} />}
        {lead.faixaInvestimento && <Row label="Faixa" value={lead.faixaInvestimento} />}
        {lead.vaiTrocar !== undefined && <Row label="Vai trocar" value={lead.vaiTrocar ? "Sim" : "Não"} />}
        {lead.fonteCampanha && <Row label="Campanha" value={lead.fonteCampanha} />}
      </div>

      {lead.tags?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</h3>
          <div className="flex flex-wrap gap-1">
            {lead.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      )}

      {lead.observacoes && (
        <div className="bg-note-bg border-l-4 border-note-border rounded-r-xl p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">Observações</p>
          <p className="text-sm text-amber-900">{lead.observacoes}</p>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}
