"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

export interface Lead {
  id: string;
  externalId?: string;
  nome?: string;
  telefone?: string;
  email?: string;
  canal: string;
  identifierCanal?: string;
  canalOrigem?: string;
  canalMensagem?: string;
  statusPipeline: string;
  biaAtiva: boolean;
  score: number;
  atendenteId?: string;
  atendente?: { id: string; nome: string };
  tags: string[];
  criadoEm: string;
  atualizadoEm: string;
  _count?: { messages: number };
}

export function useLeads(params?: Record<string, string>) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const paramsKey = JSON.stringify(params);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leads", { params });
      setLeads(data.leads);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  return { leads, total, loading, refetch: fetchLeads };
}
