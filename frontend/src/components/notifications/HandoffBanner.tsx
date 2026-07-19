"use client";

import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useHandoffStore, type HandoffEntry } from "@/store/handoffs";

export default function HandoffBanner() {
  const pending = useHandoffStore((s) => s.pending);
  const clear = useHandoffStore((s) => s.clear);
  const router = useRouter();

  if (pending.length === 0) return null;

  function handleOpen(entry: HandoffEntry) {
    clear(entry.leadId);
    router.push(`/chats?selected=${entry.leadId}`);
  }

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none max-w-xs w-full">
      {pending.map((entry) => (
        <div
          key={entry.leadId}
          className="pointer-events-auto bg-amber-50 border border-amber-300 rounded-2xl shadow-lg p-3.5 flex items-start gap-3"
          style={{ animation: "handoffSlideIn 0.2s ease-out" }}
        >
          <Bell size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-900">🔔 Bia transferiu</p>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              {entry.leadNome || "Lead"}
              {entry.agenteNome ? ` → ${entry.agenteNome}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleOpen(entry)}
              className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1 rounded-lg transition"
            >
              Abrir
            </button>
            <button
              onClick={() => clear(entry.leadId)}
              className="text-amber-400 hover:text-amber-600 transition"
              aria-label="Dispensar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes handoffSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
