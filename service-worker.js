const CACHE_NAME = "maden-soru-arsivi-v2";
const SHARE_CACHE = "maden-paylasilan";
const FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== SHARE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // WhatsApp vb. uygulamalardan "Paylaş" ile gelen PDF
  if (req.method === "POST" && url.origin === self.location.origin && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShare(req));
    return;
  }

  // Sunucu (madensoruserver) istekleri ve POST'lar doğrudan ağa gitsin
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Önce ağ, internet yoksa önbellek: site güncellenince hocalar eski sürümde kalmasın
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          const key = req.mode === "navigate" ? "./index.html" : req;
          caches.open(CACHE_NAME).then(c => c.put(key, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req.mode === "navigate" ? "./index.html" : req)
      )
  );
});

async function handleShare(request) {
  const back = status => new URL("./?paylasim=" + status, self.registration.scope).href;
  try {
    const data = await request.formData();
    const files = data.getAll("pdf").filter(f => f && typeof f === "object" && f.size > 0);

    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) await cache.delete(key);

    let i = 0;
    for (const file of files) {
      await cache.put(
        new Request(new URL("./paylasilan/" + Date.now() + "-" + i++, self.registration.scope).href),
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/pdf",
            "X-File-Name": encodeURIComponent(file.name || "paylasilan.pdf")
          }
        })
      );
    }
    return Response.redirect(back(files.length ? "1" : "bos"), 303);
  } catch (err) {
    return Response.redirect(back("hata"), 303);
  }
}
