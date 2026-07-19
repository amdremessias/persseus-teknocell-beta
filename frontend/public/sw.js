const CACHE = "teknos-v1";
const PRECACHE = ["/", "/chats", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((res) => {
            caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Teknos CRM", {
      body: data.body || "Nova mensagem",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/chats" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chats";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
