"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { RefreshCw, TrendingUp, Search } from "lucide-react";

interface FunilLead {
  id: string;
  nome: string | null;
  telefone: string | null;
  biaScore: number | null;
  biaIntencao: string | null;
  origem: string | null;
  lastContactAt: string | null;
  lastMsgTipo: string | null;
  lastMsgAt: string | null;
}

interface CountsResponse {
  counts: Record<string, number>;
  total: number;
}

interface LeadsResponse {
  stage: string;
  items: FunilLead[];
  hasMore: boolean;
}

const PAGE_SIZE = 30;

const STAGES: {
  key: string;
  label: string;
  dot: string;
  text: string;
  activeBorder: string;
  activeBg: string;
}[] = [
  { key: "novo",        label: "Novo",         dot: "bg-gray-400",   text: "text-gray-700",   activeBorder: "border-gray-400",   activeBg: "bg-gray-50" },
  { key: "interessado", label: "Interessado",  dot: "bg-blue-500",   text: "text-blue-700",   activeBorder: "border-blue-400",   activeBg: "bg-blue-50" },
  { key: "negociando",  label: "Negociando",   dot: "bg-amber-500",  text: "text-amber-700",  activeBorder: "border-amber-400",  activeBg: "bg-amber-50" },
  { key: "atendente",   label: "Com atendente",dot: "bg-purple-500", text: "text-purple-700", activeBorder: "border-purple-400", activeBg: "bg-purple-50" },
  { key: "pos_venda",   label: "Pós-venda",    dot: "bg-teal-500",   text: "text-teal-700",   activeBorder: "border-teal-400",   activeBg: "bg-teal-50" },
  { key: "fechado",     label: "Fechado ✅",    dot: "bg-green-500",  text: "text-green-700",  activeBorder: "border-green-400",  activeBg: "bg-green-50" },
  { key: "perdido",     label: "Perdido ❌",    dot: "bg-red-500",    text: "text-red-600",    activeBorder: "border-red-400",    activeBg: "bg-red-50" },
];

function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

// Semáforo de tempo sem resposta: só quando a última mensagem é do cliente.
function semaforo(tipo: string | null, at: string | null): string | null {
  if (tipo !== "cliente" || !at) return null;
  const ageH = (Date.now() - new Date(at).getTime()) / 3_600_000;
  if (ageH < 1) return "bg-green-500";
  if (ageH < 24) return "bg-amber-400";
  return "bg-red-500";
}

export default function FunilPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState("novo");
  const [items, setItems] = useState<FunilLead[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get<CountsResponse>("/funil");
      setCounts(data.counts);
      setTotal(data.total);
    } catch {
      /* silencioso — mantém contagem anterior */
    }
  }, []);

  // Carrega a primeira página da etapa (reseta a lista).
  const loadStage = useCallback(
    async (stageKey: string, q: string) => {
      setLoadingList(true);
      try {
        const { data } = await api.get<LeadsResponse>("/funil/leads", {
          params: { stage: stageKey, search: q, limit: PAGE_SIZE, offset: 0 },
        });
        // Ignora respostas de etapa antiga (troca rápida)
        if (data.stage !== stageKey) return;
        setItems(data.items);
        setHasMore(data.hasMore);
      } finally {
        setLoadingList(false);
      }
    },
    []
  );

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get<LeadsResponse>("/funil/leads", {
        params: { stage, search, limit: PAGE_SIZE, offset: items.length },
      });
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [stage, search, items.length, loadingMore]);

  // Boot: contagens.
  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  // Recarrega a lista quando muda etapa ou busca (debounce da busca).
  useEffect(() => {
    const t = setTimeout(() => loadStage(stage, search.trim()), 300);
    return () => clearTimeout(t);
  }, [stage, search, loadStage]);

  // Socket: atualiza contagens e recarrega a etapa atual (debounced).
  const onLeadEvent = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      fetchCounts();
      loadStage(stage, search.trim());
    }, 2000);
  }, [fetchCounts, loadStage, stage, search]);
  useSocket("lead:updated", onLeadEvent);
  useSocket("lead:new", onLeadEvent);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <TrendingUp size={20} className="text-green-600 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Funil de Vendas</h1>
            <p className="text-xs text-gray-400">{total} lead{total !== 1 ? "s" : ""} ativos</p>
          </div>
        </div>
        <button
          onClick={() => { fetchCounts(); loadStage(stage, search.trim()); }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {/* Cards de resumo — sempre todos visíveis, sem scroll lateral */}
      <div className="shrink-0 px-4 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {STAGES.map((s) => {
            const active = s.key === stage;
            return (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                className={`text-left rounded-xl border-2 px-3 py-2.5 transition ${
                  active
                    ? `${s.activeBorder} ${s.activeBg} shadow-sm`
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className={`text-[11px] font-semibold ${active ? s.text : "text-gray-500"} truncate`}>
                    {s.label}
                  </span>
                </div>
                <p className={`text-2xl font-bold leading-none ${active ? s.text : "text-gray-800"}`}>
                  {counts[s.key] ?? 0}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="shrink-0 px-4 pt-3 pb-2 bg-white">
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
      </div>

      {/* Lista da etapa selecionada */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loadingList ? (
          <p className="text-center text-sm text-gray-300 py-10">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-gray-300 py-10">
            {search ? "Nenhum lead encontrado" : "Nenhum lead nesta etapa"}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-w-3xl mx-auto">
            {items.map((lead) => {
              const sem = semaforo(lead.lastMsgTipo, lead.lastMsgAt);
              const hasBadge = lead.biaIntencao || lead.biaScore != null;
              const badgeText = [lead.biaIntencao, lead.biaScore != null ? lead.biaScore : null]
                .filter((x) => x !== null && x !== undefined && x !== "")
                .join(" · ");
              const scoreHot = lead.biaScore != null && lead.biaScore >= 7;
              return (
                <button
                  key={lead.id}
                  onClick={() => router.push(`/chats?selected=${lead.id}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-lg border border-gray-100 hover:border-green-300 hover:shadow-sm px-3 py-2.5 transition text-left group"
                >
                  {/* Semáforo */}
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${sem ?? "bg-transparent"}`}
                    title={sem ? "Cliente aguardando resposta" : ""}
                  />
                  {/* Nome + telefone */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700 truncate">
                      {lead.origem === "ads" && (
                        <span title="Veio de anúncio (tráfego pago)">📢 </span>
                      )}
                      {lead.nome || lead.telefone || "—"}
                    </p>
                    {lead.telefone && (
                      <p className="text-xs text-gray-400 truncate">{lead.telefone}</p>
                    )}
                  </div>
                  {/* Badge Bia */}
                  {hasBadge && (
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none ${
                        scoreHot ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {badgeText}
                    </span>
                  )}
                  {/* Tempo */}
                  <span className="shrink-0 text-[11px] text-gray-400 w-20 text-right">
                    {relativeTime(lead.lastContactAt)}
                  </span>
                </button>
              );
            })}

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-2 self-center text-sm text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {loadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
