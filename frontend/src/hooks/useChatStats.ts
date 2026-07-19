"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export interface ChatStats {
  hoje: {
    total_conversas: number;
    finalizadas: number;
    aguardando: number;
    em_atendimento: number;
    bia_atendendo: number;
  };
  tempo_medio_resposta_minutos: number | null;
  meu_atendimento_hoje: number;
}

export function useChatStats(intervalMs = 60_000) {
  const [stats, setStats] = useState<ChatStats | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchStats() {
      try {
        const { data } = await api.get("/chats/stats");
        if (mounted) setStats(data);
      } catch { /* ignore */ }
    }

    fetchStats();
    const handle = setInterval(fetchStats, intervalMs);
    return () => { mounted = false; clearInterval(handle); };
  }, [intervalMs]);

  return stats;
}
