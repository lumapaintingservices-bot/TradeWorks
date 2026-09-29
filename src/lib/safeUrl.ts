/**
 * URL safety helpers. Anything a person typed (website, Instagram, review link, e-mail, photo URL) may end up in an
 * href / src that OTHER people click or load (the public lead form, the client link). Only harmless schemes get through,
 * so `javascript:`, `data:text/html`, `vbscript:`, `file:` etc. can never run in our origin.
 */

const CTRL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\u2060\\ufeff]", "g");

/**
 * A link a user typed -> a safe absolute URL, or "" when it is not usable.
 *  - "www.luma.com" / "luma.com/x" get https:// in front (people never type the scheme)
 *  - allowed schemes: http, https (and mailto / tel only when `opts.contact` is true)
 *  - control characters and spaces inside the scheme are stripped first, so "java\nscript:" cannot sneak through
 */
export function safeUrl(input: unknown, opts: { contact?: boolean } = {}): string {
  const raw = String(input ?? "").replace(CTRL, "").trim();
  if (!raw || raw.length > 2000) return "";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  let url = raw;
  if (scheme) {
    const s = scheme[1].toLowerCase();
    const web = s === "http" || s === "https";
    const contact = !!opts.contact && (s === "mailto" || s === "tel");
    // "localhost:3000" or "host:8080/path" look like a scheme: only treat it as one when it is a known scheme
    if (!web && !contact) {
      if (/^[a-z0-9.-]+:\d+(\/|$)/i.test(raw)) url = "https://" + raw; else return "";
    }
  } else if (raw.startsWith("//")) url = "https:" + raw;
  else if (/^[\\/]/.test(raw)) return "";
  else url = "https://" + raw;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.hostname.includes(".") || u.hostname === "localhost" ? u.href : "";
    if (opts.contact && (u.protocol === "mailto:" || u.protocol === "tel:")) return u.href;
  } catch { /* not a URL */ }
  return "";
}

const IMG_DATA = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
/**
 * A URL that will be used as <img src>: https / http (Firebase Storage download links), blob:, or a base64 raster image.
 * SVG data URLs are refused (they can carry markup). Anything else -> "".
 */
export function safeImgSrc(input: unknown): string {
  const raw = String(input ?? "").replace(CTRL, "").trim();
  if (!raw) return "";
  if (IMG_DATA.test(raw)) return raw;
  if (/^blob:/i.test(raw)) return raw;
  return /^https?:\/\//i.test(raw) ? safeUrl(raw) : "";
}

/** `mailto:` link for an address a user typed (the address is encoded, so "?bcc=" tricks stay inside the address). */
export function mailtoHref(email: unknown, query = ""): string {
  const e = String(email ?? "").replace(CTRL, "").trim();
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(e)) return "";
  return "mailto:" + encodeURIComponent(e) + (query ? "?" + query : "");
}

/** Where the billing functions may send the browser: https on stripe.com hosts, or this app's own origin. */
export function isTrustedRedirect(url: unknown, appOrigin: string): boolean {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:" && !(u.origin === appOrigin && u.protocol === "http:" && u.hostname === "localhost")) return false;
    return u.hostname === "stripe.com" || u.hostname.endsWith(".stripe.com") || u.origin === appOrigin;
  } catch { return false; }
}
