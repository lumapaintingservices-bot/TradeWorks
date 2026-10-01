/**
 * Before / after photos workers take on their phones (companies/{cid}/jobphotos). Pure functions, no I/O.
 * A worker cannot read estimates, so their photos live in their own collection; the owner's app copies them onto the job
 * (estimate.photos, same id, teamId + by) so the Photos tab, client link, work order and client profile show them like any other.
 */
import { addDaysISO } from "./calendar";
import type { ClockRec, JobPhoto, PhotoRef, Task } from "./types";

export const PHOTO_KINDS = ["before", "after", "detail"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

/**
 * Jobs a worker can add photos to: the job they are clocked in to first, then the jobs of their tasks from 14 days ago to
 * 7 days ahead, closest to today first. One entry per job, named by the task's jobLabel (else its title).
 */
export function photoJobOptions(tasks: Pick<Task, "date" | "estId" | "jobLabel" | "title">[], today: string, clock?: Pick<ClockRec, "estId" | "jobLabel"> | null): { estId: string; label: string }[] {
  const from = addDaysISO(today, -14), to = addDaysISO(today, 7);
  const away = (d: string) => Math.abs(Date.parse(d + "T12:00:00") - Date.parse(today + "T12:00:00"));
  const order: string[] = [], named = new Map<string, string>(), titled = new Map<string, string>();
  const add = (estId: string | undefined, jobLabel?: string, title?: string) => {
    if (!estId) return;
    if (!order.includes(estId)) order.push(estId);
    const jl = String(jobLabel || "").trim(), tt = String(title || "").trim();
    if (jl && !named.has(estId)) named.set(estId, jl);          // a job label (from any task of that job) wins over a task title
    if (tt && !titled.has(estId)) titled.set(estId, tt);
  };
  if (clock?.estId) add(clock.estId, clock.jobLabel);
  const near = tasks.filter((k) => k.estId && k.date >= from && k.date <= to).sort((a, b) => away(a.date) - away(b.date) || a.date.localeCompare(b.date));
  for (const k of near) add(k.estId, k.jobLabel, k.title);
  return order.map((estId) => ({ estId, label: (named.get(estId) || titled.get(estId) || estId).slice(0, 120) }));
}

/** May the client see this photo (client link, documents)? Owner photos yes; a worker's only once the owner shares it. */
export const clientCanSee = (ph: Pick<PhotoRef, "teamId" | "toClient">) => !ph.teamId || !!ph.toClient;

/** A worker's photo as a photo of the job: same id, "by" the worker. */
export const teamPhotoRef = (p: JobPhoto, by: string): PhotoRef =>
  ({ id: p.id, kind: p.kind || "", caption: p.caption || "", inWork: false, url: p.url, path: p.path, teamId: p.id, by, at: p.at });

/**
 * Keeps one job's photos in step with its team photos: adds the ones not on the job yet (in the order taken) and drops the
 * ones whose team photo was deleted. The owner's own photos and edits (caption, type, "our recent work") are kept.
 * Returns null when nothing changes; `dropped` = photos taken off the job (their file can go, unless shown in "Our recent work").
 */
export function mergeTeamPhotos(photos: PhotoRef[] | undefined, team: JobPhoto[], estId: string, nameOf: (workerId: string) => string): { photos: PhotoRef[]; added: PhotoRef[]; dropped: PhotoRef[] } | null {
  const cur = photos || [];
  const live = team.filter((p) => p.estId === estId && p.url);
  const ids = new Set(live.map((p) => p.id));
  const kept = cur.filter((ph) => !ph.teamId || ids.has(ph.teamId));
  const dropped = cur.filter((ph) => ph.teamId && !ids.has(ph.teamId));
  const have = new Set(kept.map((ph) => ph.teamId || ph.id));
  const added = live.filter((p) => !have.has(p.id)).sort((a, b) => String(a.at).localeCompare(String(b.at))).map((p) => teamPhotoRef(p, nameOf(p.workerId)));
  if (!dropped.length && !added.length) return null;
  return { photos: [...kept, ...added], added, dropped };
}

/** Bytes of a data URL (the size shown on the card). */
export const dataUrlSize = (dataUrl: string) => Math.max(0, Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4));
/** 820 KB, 1.4 MB */
export function fmtSize(bytes: number | undefined): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  return (b / 1024 / 1024).toFixed(1).replace(/\.0$/, "") + " MB";
}
