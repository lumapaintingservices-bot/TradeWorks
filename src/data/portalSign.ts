import { hasFirebase } from "../lib/firebase";
import { demoSubKey, getTop, patchTop } from "./repo";

export type SignBody = { kind: "est" | "co"; coId?: string; name: string; img: string; total?: number; picks?: Record<string, boolean>; lang: "en" | "es" };
export type SignResult = { at: string; copy: string; emailed: boolean };

/**
 * The client signs the estimate (or a change order) on the link. The server writes the signature (functions/api/portal/sign.js):
 * its own time, a copy of exactly what was signed, the e-mail with that copy; the rules let no browser write a signature.
 * Demo mode has no server: the signature and its copy stay in this browser. Throws an Error with words the page can show.
 */
export async function signOnLink(token: string, b: SignBody): Promise<SignResult> {
  const at = new Date().toISOString();
  if (!hasFirebase) {
    // demo: the same signature and a copy kept in this browser (no server: no IP, no e-mail)
    const copy = b.kind === "co" ? `co-${b.coId}-${Date.parse(at)}` : `est-${Date.parse(at)}`;
    const cur = await getTop<{ data?: string; number?: string }>("portal", token);
    let co: { n?: number; amount?: number } | undefined;
    try { co = b.kind === "co" ? (JSON.parse(cur?.data || "{}").e?.changeOrders || []).find((x: { id?: string }) => x.id === b.coId) : undefined; } catch { co = undefined; }
    try {
      localStorage.setItem(demoSubKey("portal", token, "signed", copy), JSON.stringify({ kind: b.kind, coId: b.coId || "", ...(co ? { coN: co.n } : {}), name: b.name, img: b.img, at,
        amount: co ? Number(co.amount) || 0 : b.total ?? 0, picks: b.kind === "co" ? {} : b.picks || {},
        data: cur?.data || "", hash: "demo", ua: navigator.userAgent.slice(0, 300), lang: b.lang, number: cur?.number || "" }));
    } catch { /* storage full: no copy */ }
    const mark = { name: b.name, img: b.img, at, copy };
    await patchTop("portal", token, { set: b.kind === "co" ? { [`client.coSign.${b.coId}`]: mark } : { "client.sign": { ...mark, total: b.total ?? 0 }, "client.picks": b.picks || {} } });
    return { at, copy, emailed: false };
  }
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* old browser */ }
  let res: Response;
  try {
    res = await fetch("/api/portal/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...b, tz }) });
  } catch { throw new Error("offline"); }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<SignResult>;
  if (!res.ok) throw new Error(data.error || "offline");
  return { at: data.at || at, copy: data.copy || "", emailed: !!data.emailed };
}
