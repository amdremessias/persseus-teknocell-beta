"use client";

import { CHANNEL_META } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  canal: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export default function ChannelBadge({ canal, size = "sm", showLabel = false }: Props) {
  const meta = CHANNEL_META[canal?.toLowerCase()] ?? {
    label: canal || "Desconhecido",
    icon: "?",
    textColor: "text-gray-600",
    bgColor: "bg-gray-100",
    dotColor: "bg-gray-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        meta.bgColor,
        meta.textColor,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      )}
      title={meta.label}
    >
      <span className={cn("rounded-full shrink-0", meta.dotColor, size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2")} />
      {showLabel ? meta.label : meta.icon}
    </span>
  );
}
