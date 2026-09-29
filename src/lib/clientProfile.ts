/** Client profile — port of viewClient / refLink (prototype). Pure functions, no I/O. */
import { calcEstimate } from "./estimate";
import { jobStatus } from "./followups";
import { num, r2 } from "./money";
import type { Client, ColorRow, EstStatus, Estimate, Invoice, PhotoRef, Settings } from "./types";

/** Statuses that count as a won job (WON_ST in the prototype). */
export const WON_STATUSES: EstStatus[] = ["Accepted", "Deposit Paid", "Paid in Full"];
export const isWon = (s: EstStatus) => WON_STATUSES.includes(s);

/** All estimates of one client, newest first (ties keep the number order, newest number first). */
export function clientJobs<E extends Pick<Estimate, "clientId" | "date" | "number">>(estimates: E[], clientId: string): E[] {
  return estimates
    .filter((e) => e.clientId === clientId)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.number || "").localeCompare(String(a.number || "")));
}

export type ClientTiles = { jobs: number; won: number; paid: number; owes: number };

/**
 * Tiles of the profile: jobs = every estimate of the client; won / paid / owes only count jobs that are
 * Accepted or further (status derived from the invoices, as in the prototype). Paid = invoices with status
 * Paid; owes = sum of max(0, job total - paid) per job.
 */
export function clientTiles(jobs: Estimate[], invoices: Invoice[], settings: Settings): ClientTiles {
  let won = 0, paid = 0, owes = 0;
  for (const e of jobs) {
    if (!isWon(jobStatus(e, invoices))) continue;
    const price = calcEstimate(e, settings).total;
    let p = 0;
    for (const v of invoices) if (v.estId === e.id && v.status === "Paid") p += num(v.amount);
    won += price; paid += p; owes += Math.max(0, price - p);
  }
  return { jobs: jobs.length, won: r2(won), paid: r2(paid), owes: r2(owes) };
}

/** Personal referral link: anyone who uses it is saved as referred by this client. */
export function referralLink(origin: string, companyId: string, clientId: string): string {
  return `${origin.replace(/\/+$/, "")}/request?c=${encodeURIComponent(companyId)}&src=referral&ref=${encodeURIComponent(clientId)}`;
}

/** WhatsApp text that goes with the link (bilingual, in the client's language). */
export function referralMessage(link: string, lang: "en" | "es"): string {
  return (lang === "es"
    ? "¡Gracias otra vez por confiar en nosotros! Si un amigo necesita un trabajo, este es su link personal: "
    : "Thank you again for trusting us! If a friend needs work done, this is your personal link: ") + link;
}

/** Clients that came through this client's link (referredBy === id), archived ones left out, by name. */
export function referredClients<C extends Pick<Client, "id" | "name" | "referredBy" | "archived">>(clients: C[], id: string): C[] {
  return clients.filter((c) => c.referredBy === id && !c.archived).sort((a, b) => a.name.localeCompare(b.name));
}

export type ColorUsed = { estId: string; number: string; text: string };
/** "Area · Brand · Color · Sheen · Code" for each color row that has a color or brand, per job. */
export function colorsUsed(jobs: Pick<Estimate, "id" | "number" | "colors">[]): ColorUsed[] {
  const out: ColorUsed[] = [];
  for (const e of jobs) {
    for (const k of (e.colors || []) as ColorRow[]) {
      if (!(k.color || k.brand)) continue;
      out.push({ estId: e.id, number: e.number, text: [k.area, k.brand, k.color, k.sheen, k.code].filter(Boolean).join(" · ") });
    }
  }
  return out;
}

export type PhotoUsed = PhotoRef & { url: string; estId: string; number: string };
/** Photos of the client's jobs that have an image (url or data URL). */
export function clientPhotos(jobs: Pick<Estimate, "id" | "number" | "photos">[]): PhotoUsed[] {
  const out: PhotoUsed[] = [];
  for (const e of jobs) for (const p of e.photos || []) if (p.url) out.push({ ...p, url: p.url, estId: e.id, number: e.number });
  return out;
}

/** Contact line of the header: phone · email · address. */
export const contactLine = (c: Pick<Client, "phone" | "email" | "address">) => [c.phone, c.email, c.address].filter(Boolean).join(" · ");
