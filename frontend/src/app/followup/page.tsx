"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { RefreshCw, X, CalendarClock, Megaphone } from "lucide-react";

interface FollowupItem {
  number: string;
  nome: string;
  fuStage: number;
  nextFuAt: string;
  abandonoTs: string;
  leadId: string | null;
  atendenteNome: string;
  biaIntencao: string | null;
  biaScore: number | null;
  biaEstado: string | null;
  biaUrgencia: string | null;
}

const FU_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: "FU 1", color: "bg-blue-100 text-blue-700" },
  1: { label: "FU 2", color: "bg-amber-100 text-amber-700" },
  2: { label: "FU 3", color: "bg-orange-100 text-orange-700" },
};

const INTENCAO_LABEL: Record<string, { label: string; color: string }> = {
  produto:    { label: "Produto",    color: "bg-green-100 text-green-700" },
  seminovo:   { label: "Seminovo",   color: "bg-teal-100 text-teal-700" },
  troca:      { label: "Troca",      color: "bg-cyan-100 text-cyan-700" },
  preco:      { label: "Preço",      color: "bg-yellow-100 text-yellow-700" },
  assistencia:{ label: "Assistência",color: "bg-rose-100 text-rose-700" },
  outro:      { label: "Outro",      color: "bg-gray-100 text-gray-500" },
};

function scoreBadge(score: number | null) {
  if (score === null) return null;
  const color =
    score >= 8 ? "bg-green-600 text-white" :
    score >= 5 ? "bg-yellow-100 text-yellow-700" :
                 "bg-gray-100 text-gray-500";
  return { score, color };
}

function fmtBRT(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FollowupPage() {
  const router = useRouter();
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get<{ count: number; items: FollowupItem[] }>("/followups");
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleCancel(number: string, nome: string) {
    if (!confirm(`Cancelar follow-up de "${nome}"?`)) return;
    setCancelling(number);
    try {
      await api.post("/followups/cancelar", { number });
      setItems((prev) => prev.filter((i) => i.number !== number));
    } finally {
      setCancelling(null);
    }
  }

  function handleRowClick(item: FollowupItem) {
    if (item.leadId) {
      router.push(`/chats?selected=${item.leadId}`);
    }
  }

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarClock size={22} className="text-green-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Follow-up</h1>
            <p className="text-xs text-gray-400">
              {loading ? "Carregando..." : `${items.length} sequência${items.length !== 1 ? "s" : ""} na fila`}
            </p>
          </div>
          {!loading && items.length > 0 && (
            <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Carregando...
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <CalendarClock size={36} className="opacity-30" />
          <p className="text-sm">Nenhum follow-up ativo no momento</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Dono</th>
                <th className="px-4 py-3">Intenção</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Próxima etapa</th>
                <th className="px-4 py-3">Próximo disparo (BRT)</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                const fu = FU_LABEL[item.fuStage] ?? { label: `FU ${item.fuStage + 1}`, color: "bg-gray-100 text-gray-600" };
                const intencao = item.biaIntencao ? (INTENCAO_LABEL[item.biaIntencao] ?? { label: item.biaIntencao, color: "bg-gray-100 text-gray-500" }) : null;
                const sb = scoreBadge(item.biaScore);
                return (
                  <tr
                    key={item.number}
                    onClick={() => handleRowClick(item)}
                    className="hover:bg-green-50 transition cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 group-hover:text-green-700">{item.nome}</p>
                      <p className="text-xs text-gray-400">{item.number}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {item.atendenteNome}
                    </td>
                    <td className="px-4 py-3">
                      {intencao ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${intencao.color}`}>
                          {intencao.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {sb ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${sb.color}`}>
                          {sb.score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${fu.color}`}>
                        {fu.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {fmtBRT(item.nextFuAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(item.number, item.nome); }}
                        disabled={cancelling === item.number}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                      >
                        <X size={12} />
                        {cancelling === item.number ? "Cancelando..." : "Cancelar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Remarketing — espaço reservado para campanha em fila */}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">Remarketing</p>
            <p className="text-xs text-gray-400">Envie campanhas para leads inativos em fila</p>
          </div>
          <button
            disabled
            title="Em breve"
            className="flex items-center gap-2 text-xs bg-gray-100 text-gray-400 cursor-not-allowed px-4 py-2 rounded-xl font-medium"
          >
            <Megaphone size={14} />
            Remarketing
          </button>
        </div>
      </div>

    </div>
  );
}
