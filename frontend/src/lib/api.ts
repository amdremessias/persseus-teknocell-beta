import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  withCredentials: true, // necessário para enviar/receber o cookie de refresh
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const attempt = async (): Promise<string> => {
      const rt = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
      const res = await axios.post(
        "/api/auth/refresh",
        rt ? { refreshToken: rt } : null,
        { withCredentials: true }
      );
      const newToken: string = res.data.token;
      localStorage.setItem("token", newToken);
      if (res.data.user) localStorage.setItem("user", JSON.stringify(res.data.user));
      if (res.data.refreshToken) localStorage.setItem("refreshToken", res.data.refreshToken);
      return newToken;
    };
    try {
      return await attempt();
    } catch {
      await new Promise((r) => setTimeout(r, 3_000));
      try { return await attempt(); } catch { return null as unknown as string; }
    }
  })().finally(() => { refreshPromise = null; }) as Promise<string | null>;

  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err.response?.status;
    const isRefreshCall = err.config?.url?.includes("/auth/refresh");

    if (status === 401 && !isRefreshCall && typeof window !== "undefined") {
      const newToken = await tryRefresh();
      if (newToken) {
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(err.config);
      }
      // Refresh falhou — desloga
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(err);
  }
);

export default api;
