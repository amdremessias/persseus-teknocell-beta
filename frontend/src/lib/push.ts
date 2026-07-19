import api from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Retorna razão legível quando push não é suportado
export function getPushUnsupportedReason(): string | null {
  if (typeof window === "undefined") return "Ambiente servidor";

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

  if (!("serviceWorker" in navigator)) {
    console.log("[push] navigator.serviceWorker ausente");
    if (isIOS && !isStandalone) return "No iPhone, adicione o app à tela de início primeiro (Safari → Compartilhar → Adicionar à Tela de Início).";
    return "Service Worker não suportado neste navegador.";
  }
  if (!("PushManager" in window)) {
    console.log("[push] PushManager ausente");
    if (isIOS && !isStandalone) return "No iPhone, adicione o app à tela de início primeiro (Safari → Compartilhar → Adicionar à Tela de Início).";
    return "Push API não suportada neste navegador.";
  }
  if (!("Notification" in window)) {
    console.log("[push] Notification API ausente");
    return "Notificações não suportadas neste navegador.";
  }
  return null;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;

  if (!("serviceWorker" in navigator)) {
    console.log("[push] registerServiceWorker: navigator.serviceWorker não existe");
    return null;
  }

  try {
    console.log("[push] registrando /sw.js...");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    console.log("[push] service worker registrado, state:", reg.active?.state ?? "installing/waiting");
    return reg;
  } catch (err) {
    console.warn("[push] falha ao registrar service worker:", err);
    return null;
  }
}

export async function subscribePush(): Promise<boolean> {
  const unsupportedReason = getPushUnsupportedReason();
  if (unsupportedReason) {
    console.log("[push] subscribePush abortado — unsupported:", unsupportedReason);
    return false;
  }

  console.log("[push] requestPermission...");
  const permission = await Notification.requestPermission();
  console.log("[push] permission:", permission);
  if (permission !== "granted") return false;

  try {
    console.log("[push] buscando public key em /api/push/public-key...");
    const { data } = await api.get("/push/public-key");
    console.log("[push] public key recebida:", data.publicKey?.slice(0, 20) + "…");
    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    const reg = await registerServiceWorker();
    if (!reg) {
      console.log("[push] registro do SW falhou — abortando subscribe");
      return false;
    }

    await reg.update();
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      console.log("[push] cancelando subscription existente antes de renovar");
      await existing.unsubscribe();
    }

    console.log("[push] chamando pushManager.subscribe...");
    const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
    console.log("[push] subscription criada:", subscription.endpoint.slice(0, 60) + "…");

    await api.post("/push/subscribe", subscription.toJSON());
    console.log("[push] subscription salva no backend");
    return true;
  } catch (err) {
    console.warn("[push] erro ao assinar:", err);
    return false;
  }
}

export async function unsubscribePush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
    await sub.unsubscribe();
    console.log("[push] unsubscribed");
    return true;
  } catch (err) {
    console.warn("[push] erro ao cancelar assinatura:", err);
    return false;
  }
}

export async function currentPushState(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";

  const reason = getPushUnsupportedReason();
  if (reason) {
    console.log("[push] currentPushState: unsupported —", reason);
    return "unsupported";
  }

  const perm = Notification.permission as "granted" | "denied" | "default";
  console.log("[push] currentPushState:", perm);
  return perm;
}
