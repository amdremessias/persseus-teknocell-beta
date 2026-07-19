"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CHANNEL_META } from "@/lib/utils";
import type { Toast } from "@/hooks/useNotifications";

interface Props {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  const router = useRouter();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const meta = CHANNEL_META[toast.canal] ?? { label: toast.canal, dotColor: "bg-gray-400", bgColor: "bg-gray-100", textColor: "text-gray-700" };
        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-3.5 flex items-start gap-3 w-80 animate-slide-in"
            style={{ animation: "slideIn 0.2s ease-out" }}
          >
            {/* Canal dot */}
            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${meta.dotColor}`} />

            {/* Content */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => { router.push(`/chats/${toast.leadId}`); onDismiss(toast.id); }}
            >
              <p className="text-xs font-semibold text-gray-800 truncate">
                {toast.leadNome || "Novo contato"}{" "}
                <span className={`font-normal ${meta.textColor}`}>via {meta.label}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                {toast.texto.slice(0, 80)}{toast.texto.length > 80 ? "…" : ""}
              </p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-gray-300 hover:text-gray-500 transition shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
