// Hash the whole public shell, including the manifest and audio worklet.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const assets = (await readdir("dist", { recursive: true, withFileTypes: true }))
  .filter((item) => item.isFile() && item.name !== "sw.js")
  .map((item) => (item.parentPath + "/" + item.name).replace(/^dist/, ""))
  .sort();
const hash = createHash("sha256");
for (const file of assets)
  hash.update(file).update(await readFile("dist" + file));
const name = "budgeting-shell-" + hash.digest("hex").slice(0, 16);
await writeFile(
  "dist/sw.js",
  `
const name = ${JSON.stringify(name)};
const publicFiles = new Set(${JSON.stringify(assets)});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll([...publicFiles])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('budgeting-shell-') && key !== name) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.search) return;
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!publicFiles.has(file)) return;
  event.respondWith(caches.open(name).then(async cache => (await cache.match(file)) || fetch(event.request)));
});
`,
);
