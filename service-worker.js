const CACHE_NAME = "feelz-pwa-v3";
const BASE_URL = self.registration.scope;

// Daftar file yang akan di-cache saat install
const urlsToCache = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}offline.html`,
  `${BASE_URL}manifest.json`,
  `${BASE_URL}icons/logo-512x512.png`,
  `${BASE_URL}icons/logo-1024x1024.png`
];

// Install Service Worker & simpan file ke cache
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell...");
      return cache.addAll(urlsToCache);
    }).catch((err) => {
      console.error("[SW] Cache gagal dimuat:", err);
    })
  );
});

// Aktivasi dan hapus cache lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Menghapus cache lama:", key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      console.log("[SW] Activated & claimed clients");
    })()
  );
});

// Fetch event: Stale-While-Revalidate untuk file lokal, Network-first untuk eksternal
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Abaikan non-GET requests dan chrome-extension
  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  // File lokal (statis) — Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        // Fetch dari network di background untuk update cache
        const networkFetch = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        // Jika ada cache, kembalikan cache sambil update di background
        if (cachedResponse) {
          return cachedResponse;
        }

        // Jika tidak ada cache, tunggu network
        const networkResponse = await networkFetch;
        if (networkResponse) {
          return networkResponse;
        }

        // Jika network juga gagal, tampilkan offline page untuk navigasi
        if (request.mode === "navigate") {
          const offlinePage = await cache.match(`${BASE_URL}offline.html`);
          if (offlinePage) return offlinePage;
        }

        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable"
        });
      })()
    );
  }
  // Resource eksternal (API, CDN, dsb.) — Network-first
  else {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          return cachedResponse || new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable"
          });
        })
    );
  }
});

// Push Notification handler
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "FEELZ";
  const options = {
    body: data.body || "Ada pembaruan baru!",
    icon: "icons/logo-512x512.png",
    badge: "icons/logo-512x512.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "./"
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Periodic Background Sync handler
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "feelz-sync") {
    event.waitUntil(Promise.resolve());
  }
});

// Background Sync handler
self.addEventListener("sync", (event) => {
  if (event.tag === "feelz-background-sync") {
    event.waitUntil(Promise.resolve());
  }
});
