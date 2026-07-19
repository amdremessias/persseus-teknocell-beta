"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Sparkles } from "lucide-react";

interface Props {
  leadId: string;
  onSelect: (text: string) => void;
}

export default function SuggestedReplies({ leadId, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/leads/${leadId}/suggestions`);
      setSuggestions(data.suggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [leadId]);

  if (!suggestions.length && !loading) return null;

  return (
    <div className="px-4 py-2 border-t border-gray-100">
      <div className="flex items-center gap-1 mb-2">
        <Sparkles size={12} className="text-purple-500" />
        <span className="text-xs text-purple-500 font-medium">Sugestões da IA</span>
        <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-gray-600">↺ Atualizar</button>
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">Gerando sugestões...</p>
      ) : (
        <div className="flex flex-col gap-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelect(s)}
              className="text-left text-xs bg-purple-50 hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
