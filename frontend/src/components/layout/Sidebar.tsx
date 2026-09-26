"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import {
  MessageSquare, BookUser,
  Settings, ChevronDown, ChevronRight, ChevronLeft, LogOut,
  Globe, Clock, Webhook, UsersRound, FileText, Volume2, VolumeX, MessageCircle,
  Tag, Zap, Lock, Smartphone, Key, X, Bell, BellOff, CalendarClock, TrendingUp, DollarSign, Wrench, Bot,
  Network, ListOrdered,
} from "lucide-react";
import { subscribePush, unsubscribePush, currentPushState, getPushUnsupportedReason } from "@/lib/push";
import { useHandoffStore } from "@/store/handoffs";

const navItems = [
  { href: "/chats", icon: MessageSquare, label: "Chats" },
  { href: "/followup", icon: CalendarClock, label: "Follow-up" },
  { href: "/funil", icon: TrendingUp, label: "Funil" },
  { href: "/vendas", icon: DollarSign, label: "Vendas" },
  { href: "/assistencia", icon: Wrench, label: "Assistência" },
  { href: "/contacts", icon: BookUser, label: "Contatos" },
];

// Bia Vendas são sistemas externos (HTTP, fora do CRM). Abrem em nova aba —
// nada de iframe (CRM é HTTPS → mixed content bloquearia o destino HTTP).
// URLs vêm do build (NEXT_PUBLIC_ pra ser lidas no browser); IPs não hardcodados.
//  • loja/LAN → acesso na rede local da loja
//  • remoto (Tailscale) → acesso de fora via VPN
const externalLinks = [
  { url: process.env.NEXT_PUBLIC_BIA_VENDAS_URL || "http://192.168.1.50:8080", icon: Bot, label: "Bia Vendas" },
  { url: process.env.NEXT_PUBLIC_BIA_VENDAS_REMOTO_URL || "http://100.82.152.83:8080", icon: Globe, label: "Bia Vendas Remoto" },
];

const settingsItems = [
  { href: "/settings/team", icon: UsersRound, label: "Equipe", adminOnly: true },
  { href: "/settings/groups", icon: Network, label: "Grupos", adminOnly: true },
  { href: "/settings/filas", icon: ListOrdered, label: "Filas", adminOnly: true },
  { href: "/settings/atendimento", icon: MessageCircle, label: "Atendimento" },
  { href: "/settings/tags", icon: Tag, label: "Tags" },
  { href: "/settings/atalhos", icon: Zap, label: "Atalhos" },
  { href: "/settings/integracoes", icon: Lock, label: "Integrações" },
  { href: "/settings/endpoints", icon: Globe, label: "Endpoints" },
  { href: "/settings/templates", icon: FileText, label: "Templates Meta" },
  { href: "/settings/hours", icon: Clock, label: "Horário Comercial" },
  { href: "/settings/webhooks", icon: Webhook, label: "Webhooks" },
  { href: "/settings/catalogo-iphone", icon: Smartphone, label: "Catálogo iPhone" },
  { href: "/settings/mercadophone", icon: Key, label: "MP API JWT" },
];

interface SidebarProps {
  soundEnabled?: boolean;
  onSoundToggle?: (enabled: boolean) => void;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  soundEnabled = true,
  onSoundToggle,
  collapsed = false,
  onCollapseToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));
  const [pushState, setPushState] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [followupCount, setFollowupCount] = useState(0);
  const handoffCount = useHandoffStore((s) => s.pending.length);

  useEffect(() => {
    currentPushState().then(setPushState);
  }, []);

  useEffect(() => {
    function fetchCount() {
      api.get<{ count: number }>("/followups/count")
        .then(({ data }) => setFollowupCount(data.count))
        .catch(() => {});
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function handlePushToggle() {
    if (pushState === "unsupported") {
      const reason = getPushUnsupportedReason() ?? "Notificações push não suportadas neste ambiente.";
      alert(reason);
      return;
    }
    if (pushState === "denied") {
      alert("Notificações bloqueadas. Para ativar, abra as configurações do navegador e permita notificações para este site.");
      return;
    }
    if (pushState === "granted") {
      await unsubscribePush();
      setPushState("default");
      return;
    }
    // default — tenta assinar
    const ok = await subscribePush();
    const newState = ok ? "granted" : (typeof Notification !== "undefined" ? Notification.permission as "denied" | "default" : "default");
    setPushState(newState);
    if (!ok && newState !== "denied") {
      alert("Não foi possível ativar as notificações. Verifique o console para detalhes.");
    }
  }

  // When open as mobile drawer, always show expanded layout
  const effectiveCollapsed = mobileOpen ? false : collapsed;

  function handleNavClick() {
    if (mobileOpen) onMobileClose?.();
  }

  const visibleSettings = settingsItems.filter((i) => !i.adminOnly || user?.nivel === "admin");

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          "bg-white shadow-card flex flex-col py-6 shrink-0",
          // Mobile: hidden by default; visible as fixed overlay when mobileOpen
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-[220px] px-3"
            : "hidden md:flex md:relative md:min-h-screen md:transition-[width] md:duration-[250ms] md:ease-in-out",
          // Desktop width based on collapsed state
          !mobileOpen && (effectiveCollapsed ? "md:w-[52px] md:px-1" : "md:w-[180px] md:px-3")
        )}
      >
        {/* Mobile close button */}
        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        )}

        {/* Desktop collapse toggle */}
        {onCollapseToggle && !mobileOpen && (
          <button
            onClick={onCollapseToggle}
            className="absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-white shadow-card border border-gray-100 flex items-center justify-center text-gray-500 hover:text-green-600 transition"
            title={effectiveCollapsed ? "Expandir" : "Colapsar"}
            aria-label={effectiveCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {effectiveCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}

        <div className={cn("mb-8", effectiveCollapsed ? "px-1" : "px-3")}>
          {effectiveCollapsed ? (
            <h1 className="text-lg font-bold text-gray-900 text-center">T</h1>
          ) : (
            <>
              <h1 className="text-lg font-bold text-gray-900">Teknos CRM</h1>
              <p className="text-xs text-gray-400 truncate">{user?.nome}</p>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-1" onClick={handleNavClick}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === "/chats" && pathname.startsWith("/chats"));
            const badge = item.href === "/followup" && followupCount > 0 ? followupCount : null;
            const handoffBadge = item.href === "/chats" && handoffCount > 0 ? handoffCount : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={effectiveCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-xl text-sm font-medium transition",
                  effectiveCollapsed ? "relative justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                  isActive ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                )}
              >
                <item.icon size={18} />
                {!effectiveCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {badge !== null && (
                      <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                    {handoffBadge !== null && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none" title="Handoffs pendentes">
                        {handoffBadge > 99 ? "99+" : handoffBadge}
                      </span>
                    )}
                  </>
                )}
                {effectiveCollapsed && badge !== null && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
                )}
                {effectiveCollapsed && handoffBadge !== null && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
                )}
              </Link>
            );
          })}

          {/* Bia Vendas (loja/LAN e remoto/Tailscale) — sistemas externos, abrem em nova aba */}
          {externalLinks.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={effectiveCollapsed ? link.label : undefined}
              className={cn(
                "flex items-center rounded-xl text-sm font-medium transition text-gray-600 hover:bg-gray-50",
                effectiveCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
              )}
            >
              <link.icon size={18} />
              {!effectiveCollapsed && <span className="flex-1">{link.label}</span>}
            </a>
          ))}

          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (effectiveCollapsed) {
                  onCollapseToggle?.();
                  setSettingsOpen(true);
                } else {
                  setSettingsOpen((o) => !o);
                }
              }}
              title={effectiveCollapsed ? "Configurações" : undefined}
              className={cn(
                "w-full flex items-center rounded-xl text-sm font-medium transition",
                effectiveCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                pathname.startsWith("/settings")
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <Settings size={18} />
              {!effectiveCollapsed && (
                <>
                  <span className="flex-1 text-left">Configurações</span>
                  {settingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </>
              )}
            </button>

            {settingsOpen && !effectiveCollapsed && (
              <div className="ml-6 mt-1 space-y-0.5">
                {visibleSettings.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition",
                      pathname === item.href
                        ? "bg-green-50 text-green-700"
                        : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <item.icon size={14} />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className={cn("flex items-center mb-1", effectiveCollapsed ? "px-1 flex-col gap-1" : "gap-1 px-3")}>
          <button
            onClick={() => onSoundToggle?.(!soundEnabled)}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium transition",
              effectiveCollapsed ? "justify-center p-2" : "gap-2 flex-1 py-2 px-3",
              soundEnabled ? "text-green-700 hover:bg-green-50" : "text-gray-400 hover:bg-gray-50"
            )}
            title={soundEnabled ? "Som ativado — clique para silenciar" : "Som silenciado — clique para ativar"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {!effectiveCollapsed && <span className="text-xs">{soundEnabled ? "Som ligado" : "Silenciado"}</span>}
          </button>

          <button
            onClick={handlePushToggle}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium transition",
              effectiveCollapsed ? "justify-center p-2" : "gap-2 py-2 px-3",
              pushState === "granted"
                ? "text-green-700 hover:bg-green-50"
                : pushState === "denied" || pushState === "unsupported"
                  ? "text-gray-300 hover:bg-gray-50"
                  : "text-gray-400 hover:bg-gray-50"
            )}
            title={
              pushState === "granted" ? "Notificações ativadas — clique para desativar"
              : pushState === "denied" ? "Notificações bloqueadas — clique para instruções"
              : pushState === "unsupported" ? "Notificações indisponíveis — clique para saber mais"
              : "Ativar notificações push"
            }
          >
            {pushState === "granted" ? <Bell size={16} /> : <BellOff size={16} />}
            {!effectiveCollapsed && (
              <span className="text-xs">
                {pushState === "granted" ? "Notificações"
                  : pushState === "denied" ? "Bloqueadas"
                  : pushState === "unsupported" ? "Indisponível"
                  : "Ativar notif."}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={logout}
          title={effectiveCollapsed ? "Sair" : undefined}
          className={cn(
            "flex items-center rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition",
            effectiveCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <LogOut size={18} />
          {!effectiveCollapsed && <span>Sair</span>}
        </button>
      </aside>
    </>
  );
}
