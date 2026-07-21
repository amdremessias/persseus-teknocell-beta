"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "@/store/auth";
import Sidebar from "./Sidebar";
import ToastContainer from "@/components/notifications/ToastContainer";
import HandoffBanner from "@/components/notifications/HandoffBanner";
import { useNotifications } from "@/hooks/useNotifications";
import { useSocket } from "@/hooks/useSocket";
import { registerServiceWorker, subscribePush, currentPushState } from "@/lib/push";
import { useHandoffStore } from "@/store/handoffs";

const COLLAPSED_KEY = "sidebar_collapsed";

interface MobileNavContextValue {
  open: () => void;
}
const MobileNavContext = createContext<MobileNavContextValue | null>(null);
export function useMobileNav() { return useContext(MobileNavContext); }

export default function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useAuth((s) => s.hydrate);
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const router = useRouter();
  const pathname = usePathname();
  const { toasts, soundEnabled, setSoundEnabled, addToast, dismiss } = useNotifications();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { registerServiceWorker(); }, []);

  // Garante que quem está logado tenha uma subscription de push registrada, pra
  // não depender de clicar no sininho. Se já concedeu permissão, re-assina em
  // silêncio quando a subscription sumiu (ex.: após redeploy do SW). Se ainda não
  // decidiu, pede a permissão uma única vez (flag local anti-insistência).
  useEffect(() => {
    if (!hydrated || !user) return;
    (async () => {
      const state = await currentPushState();
      if (state === "granted") {
        const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub) await subscribePush(); // já concedida → re-assina sem prompt
      } else if (state === "default") {
        if (localStorage.getItem("push_prompted")) return;
        localStorage.setItem("push_prompted", "1");
        await subscribePush(); // mostra o prompt nativo uma vez
      }
    })().catch(() => {});
  }, [hydrated, user]);

  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 767px)");
    const apply = () => {
      const mobile = !!mq?.matches;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
        setMobileNavOpen(false);
      } else {
        setMobileNavOpen(false);
        try {
          const stored = localStorage.getItem(COLLAPSED_KEY);
          setCollapsed(stored === "1");
        } catch { /* ignore */ }
      }
    };
    apply();
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, []);

  function toggleCollapsed() {
    if (isMobile) return;
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    if (hydrated && user === null) router.push("/login");
  }, [user, hydrated, router]);

  useSocket("message:incoming", (data: unknown) => {
    const { leadId, leadNome, canal, texto } = data as { leadId: string; leadNome: string; canal: string; texto: string };
    addToast({ leadId, leadNome: leadNome || "Lead", canal, texto });
  });

  useSocket("lead:new", (data: unknown) => {
    const lead = data as { id: string; nome?: string; canal?: string; canalOrigem?: string };
    addToast({
      leadId: lead.id,
      leadNome: lead.nome || "Novo lead",
      canal: lead.canal || lead.canalOrigem || "whatsapp",
      texto: "Novo contato iniciado",
    });
  });

  useSocket("handoff:new", (data: unknown) => {
    const d = data as { lead_id: string; lead_nome?: string | null; handoff_reason?: string; agente_nome?: string | null };
    const leadNome = d.lead_nome || d.lead_id;
    const agenteNome = d.agente_nome || "";
    const agente = agenteNome ? ` → ${agenteNome}` : "";

    // Persistent banner + chat highlight
    useHandoffStore.getState().add({ leadId: d.lead_id, leadNome, agenteNome, timestamp: Date.now() });

    // Brief bottom toast (also triggers the beep sound via addToast)
    addToast({
      leadId: d.lead_id,
      leadNome,
      canal: "whatsapp",
      texto: `🔔 Bia transferiu: ${leadNome}${agente}`,
    });

    // Browser notification (respects the Notifications toggle = Notification.permission)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(`🔔 Bia transferiu: ${leadNome}`, {
          body: agenteNome ? `Atendente: ${agenteNome}` : (d.handoff_reason || "Atendimento solicitado"),
          icon: "/favicon.ico",
        });
      } catch { /* ignored */ }
    }
  });

  // Todos os hooks acima; só agora é seguro fazer early return
  if (!hydrated) return null;

  return (
    <MobileNavContext.Provider value={{ open: () => setMobileNavOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
          collapsed={collapsed}
          onCollapseToggle={isMobile ? undefined : toggleCollapsed}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Global mobile top bar — shown on all pages except /chats and /assistencia (which reuse ConversationList's own hamburger) */}
          {!pathname.startsWith("/chats") && !pathname.startsWith("/assistencia") && (
            <div className="md:hidden shrink-0 flex items-center gap-3 px-4 h-12 border-b border-gray-100 bg-white">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-xl transition -ml-2"
                aria-label="Abrir menu"
              >
                <Menu size={22} />
              </button>
              <span className="text-sm font-semibold text-gray-800 truncate">Teknos CRM</span>
            </div>
          )}
          <div className="flex-1 overflow-hidden">{children}</div>
        </main>
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <HandoffBanner />
      </div>
    </MobileNavContext.Provider>
  );
}
