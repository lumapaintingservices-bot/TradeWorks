// Tiny static server for the production build (dist/) that behaves like Cloudflare Pages:
//  - applies the rules of public/_headers (copied into dist/_headers by the build)
//  - `/* /index.html 200` from _redirects: unknown paths open the app (SPA)
// Usage: node e2e/serve-dist.mjs [port]   (run `npm run build` first). Used by the "csp" Playwright project.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(new URL("../dist", import.meta.url).pathname);
const port = Number(process.argv[2] || 5301);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

/** `_headers` -> [{ re, headers }] in file order (later rules add / override earlier ones, like Pages). */
function parseHeaders(text) {
  const rules = []; let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (/^\S/.test(raw)) {
      const pat = raw.trim();
      cur = { re: new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(":");
      cur.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}
const rules = existsSync(join(root, "_headers")) ? parseHeaders(readFileSync(join(root, "_headers"), "utf8")) : [];

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // SPA fallback
  const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream" };
  for (const r of rules) if (r.re.test(path)) Object.assign(headers, r.headers);
  res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`serving dist on http://127.0.0.1:${port}`));
