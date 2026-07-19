"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { X, Plus } from "lucide-react";
import Link from "next/link";

export interface Tag {
  id: string;
  nome: string;
  cor: string;
}

interface Props {
  leadId: string;
  onClose: () => void;
  onChange?: () => void;
}

const PALETTE = ["#1B5E20", "#0D47A1", "#FF6B00", "#4A148C", "#B71C1C", "#757575", "#F59E0B", "#0EA5E9"];

export default function TagModal({ leadId, onClose, onChange }: Props) {
  const [all, setAll] = useState<Tag[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [tagsRes, leadRes] = await Promise.all([
        api.get("/tags"),
        api.get(`/leads/${leadId}/tags`).catch(() => ({ data: [] })),
      ]);
      const tags: Tag[] = Array.isArray(tagsRes.data) ? tagsRes.data : tagsRes.data?.tags || [];
      const leadTags: Tag[] = Array.isArray(leadRes.data) ? leadRes.data : leadRes.data?.tags || [];
      setAll(tags);
      setApplied(new Set(leadTags.map((t) => t.id)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, [leadId]);

  async function toggle(tagId: string) {
    const isApplied = applied.has(tagId);
    if (isApplied) {
      await api.delete(`/leads/${leadId}/tags/${tagId}`).catch(() => null);
      applied.delete(tagId);
    } else {
      await api.post(`/leads/${leadId}/tags`, { tag_id: tagId }).catch(() => null);
      applied.add(tagId);
    }
    setApplied(new Set(applied));
    onChange?.();
  }

  async function createTag() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/tags", { nome: newName.trim(), cor: newColor });
      const created: Tag = data?.tag || data;
      if (created?.id) {
        await api.post(`/leads/${leadId}/tags`, { tag_id: created.id }).catch(() => null);
        setNewName("");
        await fetchAll();
        onChange?.();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[420px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Tags da conversa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : all.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhuma tag cadastrada ainda. Crie sua primeira abaixo.</p>
          ) : (
            all.map((t) => (
              <label key={t.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={applied.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="accent-green-600"
                />
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.cor }} />
                <span className="text-sm text-gray-800">{t.nome}</span>
              </label>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 p-4 space-y-2 bg-gray-50">
          <p className="text-xs font-medium text-gray-600">Criar nova tag</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da tag"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              onClick={createTag}
              disabled={!newName.trim() || creating}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1"
            >
              <Plus size={14} />
              Criar
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-6 h-6 rounded-full ${newColor === c ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <Link
            href="/settings/tags"
            className="text-xs text-gray-500 hover:text-green-700 underline underline-offset-2"
          >
            Gerenciar tags
          </Link>
        </div>
      </div>
    </div>
  );
}
