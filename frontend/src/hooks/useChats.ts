"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export interface ChatTag {
  id: string;
  nome: string;
  cor: string;
}

export interface ChatQueue {
  id: string;
  nome: string;
  cor?: string | null;
}

export interface ChatLastMessage {
  texto: string;
  criadoEm: string;
  tipo: string;
  fromMe: boolean;
}

export interface ChatItem {
  id: string;
  nome: string | null;
  telefone: string | null;
  canal: string;
  identifierCanal: string | null;
  lastMessage: ChatLastMessage | null;
  unreadCount: number;
  status: "aguardando" | "bia_atendendo" | "atendente_atendendo" | "finalizado";
  atendenteAtual: { id: string; nome: string } | null;
  biaAtiva: boolean;
  tags: (ChatTag | string)[];
  pinned: boolean;
  notesCount: number;
  fila?: ChatQueue | null;
  ticketNumero?: number | null;
  ticketStatus?: string | null;
}

export interface UseChatsParams {
  canal?: string;
  atendenteId?: string;
  tagId?: string;
  search?: string;
  assistencia?: boolean;
  queueId?: string;
  finalizadas?: boolean;
}

export function useChats(params: UseChatsParams = {}, skip = false) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!skip);

  const key = JSON.stringify(params);

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      if (params.canal) query.canal = params.canal;
      if (params.atendenteId) query.atendenteId = params.atendenteId;
      if (params.tagId) query.tagId = params.tagId;
      if (params.search) query.search = params.search;
      if (params.assistencia) query.assistencia = "1";
      if (params.queueId) query.queueId = params.queueId;
      if (params.finalizadas) query.finalizadas = "1";
      const { data } = await api.get("/chats", { params: query });
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { if (!skip) fetchChats(); }, [fetchChats, skip]);

  return { items, total, loading, refetch: fetchChats };
}
