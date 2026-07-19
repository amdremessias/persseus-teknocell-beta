"use client";

import { create } from "zustand";
import axios from "axios";
import api from "@/lib/api";
import { updateSocketAuth } from "@/lib/socket";

interface User {
  id: string;
  nome: string;
  email: string;
  nivel: "admin" | "supervisor" | "atendente";
}

interface AuthStore {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

let refreshTimerId: ReturnType<typeof setTimeout> | null = null;

function scheduleTokenRefresh(token: string) {
  if (refreshTimerId) clearTimeout(refreshTimerId);
  const exp = decodeJwtExp(token);
  if (!exp) return;
  const msUntilRefresh = (exp - Math.floor(Date.now() / 1000) - 60) * 1000;
  if (msUntilRefresh <= 0) return;
  refreshTimerId = setTimeout(async () => {
    const attempt = async () => {
      const storedRefreshToken = localStorage.getItem("refreshToken");
      const res = await axios.post<{ token: string; refreshToken?: string; user: User }>(
        "/api/auth/refresh",
        storedRefreshToken ? { refreshToken: storedRefreshToken } : null,
        { withCredentials: true }
      );
      const newToken = res.data.token;
      localStorage.setItem("token", newToken);
      if (res.data.refreshToken) localStorage.setItem("refreshToken", res.data.refreshToken);
      if (res.data.user) localStorage.setItem("user", JSON.stringify(res.data.user));
      useAuth.setState({ token: newToken, user: res.data.user ?? useAuth.getState().user });
      updateSocketAuth(newToken);
      scheduleTokenRefresh(newToken);
    };
    try {
      await attempt();
    } catch {
      setTimeout(async () => {
        if (!useAuth.getState().user) return;
        try { await attempt(); } catch { /* interceptor 401 cobre o resto */ }
      }, 5_000);
    }
  }, msUntilRefresh);
}

function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const payload = JSON.parse(atob(pad ? b64 + "=".repeat(4 - pad) : b64));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export const useAuth = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    let cachedUser: User | null = null;
    if (userStr) {
      try { cachedUser = JSON.parse(userStr); } catch { cachedUser = null; }
    }

    // Aceita o token do localStorage só se ainda tiver >30s de vida.
    if (token && cachedUser) {
      const exp = decodeJwtExp(token);
      const nowSec = Math.floor(Date.now() / 1000);
      if (exp && exp - nowSec > 30) {
        set({ token, user: cachedUser, hydrated: true });
        scheduleTokenRefresh(token);
        return;
      }
    }

    // Token ausente, expirado ou prestes a expirar → tenta refresh com cookie (60 dias)
    // ou refreshToken do localStorage (fallback iOS/ITP).
    try {
      const storedRefreshToken = localStorage.getItem("refreshToken");
      const res = await axios.post<{ token: string; refreshToken?: string; user: User }>(
        "/api/auth/refresh",
        storedRefreshToken ? { refreshToken: storedRefreshToken } : null,
        { withCredentials: true }
      );
      localStorage.setItem("token", res.data.token);
      if (res.data.refreshToken) localStorage.setItem("refreshToken", res.data.refreshToken);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      set({ token: res.data.token, user: res.data.user, hydrated: true });
      scheduleTokenRefresh(res.data.token);
    } catch {
      // Refresh falhou de verdade → limpa e marca como deslogado.
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      set({ token: null, user: null, hydrated: true });
    }
  },

  login: async (email, senha) => {
    const { data } = await api.post("/auth/login", { email, senha });
    localStorage.setItem("token", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
    set({ token: data.token, user: data.user, hydrated: true });
    scheduleTokenRefresh(data.token);
  },

  logout: () => {
    api.post("/auth/logout").catch(() => {});
    if (refreshTimerId) { clearTimeout(refreshTimerId); refreshTimerId = null; }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    set({ token: null, user: null, hydrated: true });
    window.location.href = "/login";
  },
}));
