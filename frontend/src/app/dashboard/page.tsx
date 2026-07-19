"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, MessageSquare, Target, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface Stats {
  totalLeads: number;
  convertidos: number;
  taxaConversao: number;
  comissaoPorAtendente: { nome: string; conversoes: number }[];
  messagesByDay: { day: string; total: number }[];
}

interface JwtStatus {
  configured: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jwtStatus, setJwtStatus] = useState<JwtStatus | null>(null);

  useEffect(() => {
    api.get("/stats/dashboard").then(({ data }) => setStats(data));
    api.get<JwtStatus>("/integrations/mercadophone-jwt-status")
      .then(({ data }) => setJwtStatus(data))
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel</h1>

      {jwtStatus && jwtStatus.daysLeft !== null && jwtStatus.daysLeft <= 5 && (
        <Link href="/settings/mercadophone" className="block mb-5">
          <div className={`flex items-start gap-3 rounded-card p-4 border ${jwtStatus.daysLeft <= 0 ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">
                {jwtStatus.daysLeft <= 0
                  ? "JWT do MercadoPhone expirado — disparo proativo bloqueado"
                  : `JWT do MercadoPhone expira em ${jwtStatus.daysLeft} dia${jwtStatus.daysLeft !== 1 ? "s" : ""}`}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                Clique aqui para renovar em Configurações → MercadoPhone API JWT
              </p>
            </div>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users size={22} />} label="Leads (30d)" value={stats.totalLeads} color="blue" href="/chats" />
        <StatCard icon={<Target size={22} />} label="Convertidos" value={stats.convertidos} color="green" />
        <StatCard icon={<TrendingUp size={22} />} label="Taxa de conversão" value={`${stats.taxaConversao}%`} color="purple" />
        <StatCard
          icon={<MessageSquare size={22} />}
          label="Mensagens/dia"
          value={stats.messagesByDay.length > 0
            ? Math.round(stats.messagesByDay.reduce((s, d) => s + d.total, 0) / stats.messagesByDay.length)
            : 0}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-card shadow-card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Mensagens por dia</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.messagesByDay}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#4ADE80" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-card shadow-card p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Conversões por atendente</h2>
          {stats.comissaoPorAtendente.length === 0 ? (
            <p className="text-gray-400 text-sm">Sem dados ainda</p>
          ) : (
            <div className="space-y-3">
              {stats.comissaoPorAtendente.map((a) => (
                <div key={a.nome} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{a.nome}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full"
                        style={{ width: `${Math.min(100, (a.conversoes / stats.convertidos) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{a.conversoes}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, href }: { icon: React.ReactNode; label: string; value: string | number; color: string; href?: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  const inner = (
    <>
      <div className={`inline-flex p-2 rounded-xl ${colorMap[color]} mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="bg-white rounded-card shadow-card p-5 block cursor-pointer hover:shadow-md transition-shadow">
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-white rounded-card shadow-card p-5">
      {inner}
    </div>
  );
}
