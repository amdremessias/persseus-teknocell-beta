"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { FileText, Download, ExternalLink, X } from "lucide-react";

export interface Message {
  id: string;
  tipo: "cliente" | "bia" | "atendente" | "interno";
  texto: string;
  criadoEm: string;
  deliveryStatus?: string | null;
  mediaUrl?: string | null;
}

function DeliveryIcon({ status }: { status?: string | null }) {
  if (!status || status === "pending") {
    return (
      <svg className="inline w-3 h-3 ml-1 text-gray-400" viewBox="0 0 16 16" fill="none">
        <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "failed") {
    return <span className="ml-1 text-[10px] text-red-400">✗</span>;
  }
  const blue = status === "read";
  const color = blue ? "text-blue-500" : "text-gray-400";
  return (
    <svg className={cn("inline w-4 h-3 ml-1", color)} viewBox="0 0 20 16" fill="none">
      <path d="M1 8l4 4 6-7"   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 8l4 4 6-7"   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const AUDIO_EXT_RE = /\.(opus|ogg|mp3|m4a|wav|aac|oga)(\?|$)/i;

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/+$/, "");

function getAudioSrc(src: string): string {
  if (!src.startsWith("http") || src.includes("teknoscel.shop")) return src;
  return `${API_BASE}/public/audio-proxy?url=${encodeURIComponent(src)}`;
}

function AudioPlayer({ src }: { src: string }) {
  const proxied = getAudioSrc(src);
  return (
    <div className="mb-1 flex flex-col gap-1">
      <audio
        controls
        src={proxied}
        className="max-w-[260px] w-full h-9 rounded-lg"
        style={{ colorScheme: "light" }}
        preload="metadata"
      />
      <a
        href={proxied}
        download
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition w-fit"
      >
        <ExternalLink size={10} />
        baixar áudio
      </a>
    </div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    history.pushState({ lightbox: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Se fechou via X/backdrop (não via botão voltar), limpa o estado de histórico
      if (history.state?.lightbox) history.back();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fechar"
      >
        <X size={24} />
      </button>
      <img
        src={url}
        alt=""
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

function MediaPreview({ url, caption }: { url: string; caption: string }) {
  const isAudio = AUDIO_EXT_RE.test(url);
  const isImage = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(url);
  const [lightbox, setLightbox] = useState(false);

  if (isAudio) return <AudioPlayer src={url} />;

  if (isImage) {
    return (
      <div className="mb-1">
        <img
          src={url}
          alt={caption}
          className="max-w-full rounded-xl max-h-60 object-cover cursor-pointer hover:opacity-90 transition"
          onClick={() => setLightbox(true)}
        />
        {lightbox && <ImageLightbox url={url} onClose={() => setLightbox(false)} />}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 mb-1 px-3 py-2 bg-black/5 rounded-xl hover:bg-black/10 transition"
    >
      <FileText size={18} className="shrink-0 text-gray-500" />
      <span className="text-sm text-gray-700 truncate flex-1">{caption}</span>
      <Download size={14} className="shrink-0 text-gray-400" />
    </a>
  );
}

export default function MessageBubble({ msg }: { msg: Message }) {
  const isClient   = msg.tipo === "cliente";
  const isInternal = msg.tipo === "interno";
  const isAgent    = msg.tipo === "atendente" || msg.tipo === "bia";

  if (isInternal) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-note-bg border-l-4 border-note-border rounded-r-xl px-4 py-2 max-w-sm">
          <p className="text-xs text-amber-800">{msg.texto}</p>
          <p className="text-[10px] text-amber-500 mt-1">
            {format(new Date(msg.criadoEm), "HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex mb-2", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[72%] px-3 py-2 rounded-2xl text-[13px]",
          isClient ? "bg-white rounded-tl-sm shadow-sm" : "bg-bubble-agent rounded-tr-sm"
        )}
      >
        {msg.tipo === "bia" && (
          <p className="text-[10px] text-purple-500 font-semibold mb-1">🤖 Bia</p>
        )}
        {msg.mediaUrl && <MediaPreview url={msg.mediaUrl} caption={msg.texto} />}
        {!msg.mediaUrl && AUDIO_EXT_RE.test(msg.texto || "") ? (
          <AudioPlayer src={msg.texto} />
        ) : (!msg.mediaUrl || msg.texto) && (
          <p className="text-gray-800 whitespace-pre-wrap">{msg.texto}</p>
        )}
        <div className="flex items-center justify-end gap-0.5 mt-1">
          <span className="text-[10px] text-gray-400">
            {format(new Date(msg.criadoEm), "HH:mm", { locale: ptBR })}
          </span>
          {isAgent && msg.tipo === "atendente" && (
            <DeliveryIcon status={msg.deliveryStatus} />
          )}
        </div>
      </div>
    </div>
  );
}
