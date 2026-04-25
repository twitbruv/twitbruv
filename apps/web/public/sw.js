// twotter service worker
// Goals (kept deliberately small):
//  1. Offline-friendly app shell: cache the root document + the static assets
//     served from /assets/ (Vite hashes those, so they're safe to cache forever).
//  2. Web push: render incoming push payloads as notifications and route taps
//     back into the SPA.
//  3. Future-proof: SKIP_WAITING on demand so a new build can roll out without
//     a tab restart.

const SW_VERSION = "v1"
const SHELL_CACHE = `twotter-shell-${SW_VERSION}`
const RUNTIME_CACHE = `twotter-runtime-${SW_VERSION}`
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/icon-192.svg",
  "/icon-512.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Add each URL individually so a single 404 doesn't poison the install.
      Promise.all(
        SHELL_URLS.map((u) =>
          cache.add(u).catch(() => {
            /* best-effort */
          }),
        ),
      ),
    ),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

// Network-first for navigations (we want fresh HTML when online), with the
// cached shell as a fallback when offline. Static /assets/ requests are
// stale-while-revalidate so repeat visits feel instant.
self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(SHELL_CACHE)
        const cached = await cache.match("/")
        return cached ?? Response.error()
      }),
    )
    return
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached ?? network
      }),
    )
  }
})

// Web push: payload is a JSON blob produced by the server's notification
// dispatcher. We keep the schema permissive so older sw versions can still
// render newer kinds.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "twotter", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "twotter"
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.svg",
    badge: data.badge || "/icon-192.svg",
    tag: data.tag,
    data: { url: data.url || "/notifications" },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        if (c.url.includes(target) && "focus" in c) return c.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return null
    }),
  )
})
