"use client";

import { useState } from "react";
import { Megaphone, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

interface Ads {
  source_id?: string | null;
  headline?: string | null;
  body?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
}

interface Props {
  ads: Ads;
}

// Card mostrado no topo da conversa quando o lead veio de um anúncio CTWA.
// Dá ao atendente (e à Bia) o contexto do que o cliente clicou: título, trecho
// da copy, prévia (imagem/thumb) e link pro post — em vez do genérico "veio de ad".
export default function AdsOriginCard({ ads }: Props) {
  const [expanded, setExpanded] = useState(false);

  const headline = ads.headline?.trim() || null;
  const body = ads.body?.trim() || null;
  const url = ads.source_url?.trim() || null;
  const preview = ads.image_url || ads.thumbnail_url || null;
  const isVideo = ads.media_type === "video" || !!ads.video_url;

  // Copy longa fica truncada em 2 linhas até o atendente expandir.
  const bodyIsLong = !!body && body.length > 120;

  return (
    <div className="mx-3 mt-3 mb-1 rounded-xl border border-blue-200 bg-blue-50/70 overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        {preview && (
          <a
            href={url || preview}
            target="_blank"
            rel="noopener noreferrer"
            className="relative shrink-0"
            title="Abrir anúncio"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Prévia do anúncio"
              className="h-16 w-16 rounded-lg object-cover border border-blue-200"
            />
            {isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <span className="ml-0.5 w-0 h-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-white" />
                </span>
              </span>
            )}
          </a>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
            <Megaphone size={13} className="shrink-0" />
            Veio de anúncio
          </div>

          {headline ? (
            <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{headline}</p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              O cliente chegou por um anúncio (sem título capturado).
            </p>
          )}

          {body && (
            <>
              <p
                className={`mt-0.5 text-xs text-gray-600 break-words whitespace-pre-wrap ${
                  !expanded && bodyIsLong ? "line-clamp-2" : ""
                }`}
              >
                {body}
              </p>
              {bodyIsLong && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                >
                  {expanded ? "Ver menos" : "Ver mais"}
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </>
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              <ExternalLink size={12} />
              Ver anúncio
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
