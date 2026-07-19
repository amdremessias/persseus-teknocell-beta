"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export interface QuickReply {
  id: string;
  atalho: string;
  texto: string;
  escopo: "company" | "user";
  userId?: string | null;
}

interface Props {
  query: string;
  onPick: (texto: string) => void;
  onClose: () => void;
}

export default function QuickRepliesDropdown({ query, onPick, onClose }: Props) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/quick-replies")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : r.data?.items || [];
        if (mounted) setItems(list);
      })
      .catch(() => { if (mounted) setItems([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const search = query.replace(/^\//, "").toLowerCase();
  const filtered = search
    ? items.filter((i) => i.atalho.toLowerCase().includes(search))
    : items;

  if (loading) return null;
  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 max-h-60 overflow-y-auto z-10">
      <ul>
        {filtered.map((q) => (
          <li key={q.id}>
            <button
              onClick={() => onPick(q.texto)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition flex items-center justify-between gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">/{q.atalho}</p>
                <p className="text-xs text-gray-500 truncate">{q.texto}</p>
              </div>
              {q.escopo === "user" && (
                <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">pessoal</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={onClose}
        className="w-full text-[11px] text-gray-400 hover:text-gray-600 py-1.5 border-t border-gray-50"
      >
        Esc para fechar
      </button>
    </div>
  );
}
