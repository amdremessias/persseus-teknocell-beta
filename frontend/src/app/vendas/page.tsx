"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { RefreshCw, DollarSign, Package, UserRound } from "lucide-react";

interface Venda {
  id: string;
  leadId: string;
  produto: string;
  modelo: string | null;
  armazenamento: string | null;
  valor: number | null;
  seminovo: boolean;
  criadoEm: string;
  leadNome: string | null;
  origem: "ads" | "organico";
  atendenteNome: string | null;
}

interface Bucket { count: number; total: number }

interface VendasResponse {
  vendas: Venda[];
  summary: {
    count: number;
    total: number;
    porOrigem: Record<string, Bucket>;
    porProduto: Record<string, Bucket>;
    porAtendente: Record<string, Bucket>;
  };
}

const PERIODOS: { days: number; label: string }[] = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "1 ano" },
];

const PRODUTO_LABEL: Record<string, string> = {
  iphone: "iPhone",
  macbook: "MacBook",
  apple_watch: "Apple Watch",
  ipad: "iPad",
  airpods: "AirPods",
  acessorio: "Acessório",
  conserto: "Conserto",
  outro: "Outro",
};
const PRODUTO_ORDER = ["iphone", "macbook", "apple_watch", "ipad", "airpods", "acessorio", "conserto", "outro"];

const PAGE_SIZE = 50;

const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const brlShort = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function VendasPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<VendasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<VendasResponse>("/vendas", { params: { days: d } });
      setData(data);
      setVisible(PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(days); }, [days, fetchData]);

  const s = data?.summary;
  const ads = s?.porOrigem?.ads ?? { count: 0, total: 0 };
  const organico = s?.porOrigem?.organico ?? { count: 0, total: 0 };

  const produtos = PRODUTO_ORDER
    .filter((p) => s?.porProduto?.[p])
    .map((p) => ({ key: p, label: PRODUTO_LABEL[p] ?? p, ...s!.porProduto[p] }));
  const atendentes = Object.entries(s?.porAtendente ?? {})
    .map(([nome, b]) => ({ nome, ...b }))
    .sort((a, b) => b.total - a.total);

  const vendas = data?.vendas ?? [];
  const shown = vendas.slice(0, visible);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-white flex-wrap">
        <div className="flex items-center gap-3">
          <DollarSign size={20} className="text-green-600 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Vendas</h1>
            <p className="text-xs text-gray-400">
              {loading ? "Carregando…" : `${s?.count ?? 0} venda${(s?.count ?? 0) !== 1 ? "s" : ""} no período`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de período */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition ${
                  days === p.days ? "bg-white text-green-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData(days)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 px-3 py-1.5 rounded-lg transition"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-xl border-2 border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[11px] font-semibold text-gray-500">Vendas</span>
              </div>
              <p className="text-2xl font-bold leading-none text-gray-800">{s?.count ?? 0}</p>
            </div>
            <div className="rounded-xl border-2 border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-semibold text-gray-500">Faturamento</span>
              </div>
              <p className="text-2xl font-bold leading-none text-emerald-700">{brlShort(s?.total)}</p>
            </div>
            <div className="rounded-xl border-2 border-blue-100 bg-blue-50/40 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-semibold text-blue-700">📢 Ads</span>
              </div>
              <p className="text-2xl font-bold leading-none text-blue-700">{ads.count}</p>
              <p className="text-xs text-blue-500/80 mt-0.5">{brlShort(ads.total)}</p>
            </div>
            <div className="rounded-xl border-2 border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-[11px] font-semibold text-gray-500">Orgânico</span>
              </div>
              <p className="text-2xl font-bold leading-none text-gray-800">{organico.count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{brlShort(organico.total)}</p>
            </div>
          </div>

          {/* Por produto + Por atendente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BreakdownBlock icon={<Package size={15} className="text-gray-400" />} titulo="Por produto"
              rows={produtos.map((p) => ({ key: p.key, label: p.label, count: p.count, total: p.total }))}
              loading={loading} />
            <BreakdownBlock icon={<UserRound size={15} className="text-gray-400" />} titulo="Por atendente"
              rows={atendentes.map((a) => ({ key: a.nome, label: a.nome, count: a.count, total: a.total }))}
              loading={loading} />
          </div>

          {/* Tabela de vendas */}
          <div>
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                    <th className="px-4 py-3 whitespace-nowrap">Data</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Valor</th>
                    <th className="px-4 py-3">Atendente</th>
                    <th className="px-4 py-3">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-300 text-sm">Carregando…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-300 text-sm">Nenhuma venda no período</td></tr>
                  ) : (
                    shown.map((v) => (
                      <tr key={v.id} className="hover:bg-green-50/50 transition">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtData(v.criadoEm)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/chats?selected=${v.leadId}`)}
                            className="font-medium text-gray-800 hover:text-green-700 hover:underline text-left"
                          >
                            {v.origem === "ads" && <span title="Veio de anúncio">📢 </span>}
                            {v.leadNome || "—"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {PRODUTO_LABEL[v.produto] ?? v.produto}
                          {v.seminovo && (
                            <span className="ml-1.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 align-middle">
                              seminovo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {v.modelo || "—"}{v.armazenamento ? ` · ${v.armazenamento}` : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                          {v.valor != null ? brl(v.valor) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{v.atendenteNome || "—"}</td>
                        <td className="px-4 py-3">
                          {v.origem === "ads" ? (
                            <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">📢 Ads</span>
                          ) : (
                            <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Orgânico</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && vendas.length > visible && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="text-sm text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300 px-4 py-2 rounded-lg transition"
                >
                  Carregar mais ({vendas.length - visible} restantes)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BreakdownBlock({
  icon, titulo, rows, loading,
}: {
  icon: React.ReactNode;
  titulo: string;
  rows: { key: string; label: string; count: number; total: number }[];
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-100 shadow-sm bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 bg-gray-50/50">
        {icon}
        <span className="text-xs font-semibold text-gray-600">{titulo}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-gray-300">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-300">Sem dados</p>
        ) : (
          rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-gray-700 truncate">{r.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{r.count}</span>
                <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(r.total || 0)}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
