const CACHE_NAME = "kpop-collection-shell-v0.7-photos-2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/scrapbook.css",
  "/app.js?v=0.7-photos",
  "/album-photos.css?v=1",
  "/js/photos.js",
  "/reference-masthead.css?v=2",
  "/assets/scrapbook/reference-masthead.png",
  "/js/api.js",
  "/js/store.js",
  "/js/components.js",
  "/js/components.js?v=masthead2",
  "/js/pages.js",
  "/js/dialogs.js",
  "/js/agent-tools.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/assets/scrapbook/paper-grid.svg",
  "/assets/scrapbook/doodle-heart.svg",
  "/assets/scrapbook/doodle-star.svg",
  "/assets/scrapbook/doodle-bunny.svg",
  "/assets/scrapbook/collection-corner.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("kpop-collection-shell-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Dynamic collection data and uploaded covers remain network-only.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/index.html")) || cache.match("/");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Avoid mixing old page modules with a newly published application.
      return /\.(js|css)$/.test(url.pathname) ? network : cached || network;
    }),
  );
});
