import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function scoreEmoji(score: number) {
  if (score >= 70) return "🔥";
  if (score >= 40) return "🟡";
  return "🟢";
}

export function formatPhone(phone: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;  // +55 DD 9XXXX-XXXX
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;  // +55 DD XXXX-XXXX
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; // DD 9XXXX-XXXX
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; // DD XXXX-XXXX
  return phone;
}

export const CHANNEL_META: Record<string, { label: string; icon: string; textColor: string; bgColor: string; dotColor: string }> = {
  whatsapp:  { label: "WhatsApp",  icon: "W", textColor: "text-green-700",  bgColor: "bg-green-100",   dotColor: "bg-green-500"  },
  instagram: { label: "Instagram", icon: "IG", textColor: "text-pink-700",  bgColor: "bg-pink-100",    dotColor: "bg-pink-500"   },
  messenger: { label: "Messenger", icon: "M", textColor: "text-blue-700",   bgColor: "bg-blue-100",    dotColor: "bg-blue-500"   },
  telegram:  { label: "Telegram",  icon: "TG", textColor: "text-cyan-700",  bgColor: "bg-cyan-100",    dotColor: "bg-cyan-500"   },
  tiktok:    { label: "TikTok",    icon: "TT", textColor: "text-gray-900",  bgColor: "bg-gray-200",    dotColor: "bg-gray-800"   },
};

export function channelIcon(canal: string) {
  const icons: Record<string, string> = {
    whatsapp: "📱", facebook: "📘", instagram: "📸", tiktok: "🎵", formulario: "📝",
  };
  return icons[canal?.toLowerCase()] || "💬";
}

export function formatIdentifier(canal: string, identifier: string) {
  if (!identifier) return "";
  if (canal === "whatsapp") return formatPhone(identifier);
  return identifier;
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function channelBadge(canal: string): { letter: string; bg: string; fg: string } {
  const map: Record<string, { letter: string; bg: string; fg: string }> = {
    whatsapp:  { letter: "W",  bg: "bg-green-100",  fg: "text-green-700"  },
    instagram: { letter: "IG", bg: "bg-pink-100",   fg: "text-pink-700"   },
    messenger: { letter: "M",  bg: "bg-blue-100",   fg: "text-blue-700"   },
    telegram:  { letter: "TG", bg: "bg-cyan-100",   fg: "text-cyan-700"   },
    tiktok:    { letter: "TT", bg: "bg-gray-200",   fg: "text-gray-900"   },
  };
  return map[canal?.toLowerCase()] || { letter: "?", bg: "bg-gray-100", fg: "text-gray-600" };
}
