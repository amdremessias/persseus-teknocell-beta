"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface Toast {
  id: string;
  leadId: string;
  leadNome: string;
  canal: string;
  texto: string;
  createdAt: number;
}

const SOUND_KEY = "teknos_sound_enabled";
const DISMISS_MS = 6000;

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext not available (SSR, blocked by browser)
  }
}

export function useNotifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const baseTitle = useRef("Teknos CRM");

  // Hydrate sound preference from localStorage (client only)
  useEffect(() => {
    const stored = localStorage.getItem(SOUND_KEY);
    setSoundEnabledState(stored !== "false");
  }, []);

  // Keep document.title in sync with unread count
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle.current}` : baseTitle.current;
  }, [unreadCount]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(SOUND_KEY, enabled ? "true" : "false");
    setSoundEnabledState(enabled);
  }, []);

  const addToast = useCallback((payload: Omit<Toast, "id" | "createdAt">) => {
    const toast: Toast = { ...payload, id: crypto.randomUUID(), createdAt: Date.now() };
    setToasts((prev) => [toast, ...prev].slice(0, 5)); // máximo 5 toasts simultâneos
    setUnreadCount((n) => n + 1);
    if (soundEnabled) playBeep();

    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, DISMISS_MS);
  }, [soundEnabled]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return { toasts, unreadCount, soundEnabled, setSoundEnabled, addToast, dismiss, markRead };
}
