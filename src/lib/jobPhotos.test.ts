import { describe, expect, it } from "vitest";
import { dataUrlSize, fmtSize, mergeTeamPhotos, photoJobOptions } from "./jobPhotos";
import type { JobPhoto, PhotoRef } from "./types";

const jp = (o: Partial<JobPhoto>): JobPhoto => ({ id: "t1", workerId: "w1", estId: "e1", kind: "before", url: "https://x/t1.jpg", path: "companies/c/jobphotos/w1/t1.jpg", date: "2026-09-30", at: "2026-09-30T10:00:00Z", ...o });
const nameOf = (id: string) => (id === "w1" ? "Carlos" : "");

describe("photo job options", () => {
  it("clocked-in job first, then my tasks' jobs closest to today; labels from jobLabel, else the title", () => {
    const tasks = [
      { date: "2026-09-20", estId: "e3", jobLabel: "EST-3 · Cy", title: "Old" },
      { date: "2026-09-30", estId: "e2", title: "Pick up paint" },
      { date: "2026-10-01", estId: "e2", jobLabel: "EST-2 · Bo", title: "Paint" },
      { date: "2026-09-30", estId: "", title: "Shop run" },
      { date: "2026-08-01", estId: "e9", jobLabel: "Too old", title: "x" },
      { date: "2026-10-20", estId: "e8", jobLabel: "Too far", title: "x" },
      { date: "2026-09-29", estId: "e1", jobLabel: "EST-1 · Ana", title: "Prime" },
    ];
    expect(photoJobOptions(tasks, "2026-09-30", { estId: "e1", jobLabel: "EST-1 · Ana" })).toEqual([
      { estId: "e1", label: "EST-1 · Ana" }, { estId: "e2", label: "EST-2 · Bo" }, { estId: "e3", label: "EST-3 · Cy" }]);
    expect(photoJobOptions([{ date: "2026-09-30", estId: "e2", title: "Pick up paint" }], "2026-09-30")).toEqual([{ estId: "e2", label: "Pick up paint" }]);
    expect(photoJobOptions([], "2026-09-30", null)).toEqual([]);
  });
});

describe("team photos onto the job", () => {
  it("adds new team photos (in the order taken), keeps the owner's photos and edits", () => {
    const own: PhotoRef = { id: "p1", kind: "detail", caption: "mine", url: "https://x/p1.jpg" };
    const r = mergeTeamPhotos([own], [jp({ id: "t2", at: "2026-09-30T11:00:00Z" }), jp({}), jp({ id: "o", estId: "e2" })], "e1", nameOf)!;
    expect(r.photos.map((p) => p.id)).toEqual(["p1", "t1", "t2"]);
    expect(r.photos[1]).toMatchObject({ teamId: "t1", by: "Carlos", kind: "before", inWork: false, path: "companies/c/jobphotos/w1/t1.jpg" });
    expect(r.dropped).toEqual([]);
    // already there (even with the owner's caption): nothing to do
    const edited = r.photos.map((p) => (p.id === "t1" ? { ...p, caption: "Kitchen", kind: "after" } : p));
    expect(mergeTeamPhotos(edited, [jp({ id: "t2", at: "2026-09-30T11:00:00Z" }), jp({})], "e1", nameOf)).toBeNull();
  });
  it("drops photos whose team photo was deleted; never the owner's own", () => {
    const cur: PhotoRef[] = [{ id: "p1", kind: "", caption: "" }, { id: "t1", kind: "before", caption: "", teamId: "t1", inWork: true }, { id: "t2", kind: "after", caption: "", teamId: "t2" }];
    const r = mergeTeamPhotos(cur, [jp({ id: "t2" })], "e1", nameOf)!;
    expect(r.photos.map((p) => p.id)).toEqual(["p1", "t2"]);
    expect(r.dropped.map((p) => p.id)).toEqual(["t1"]);
    expect(mergeTeamPhotos(undefined, [], "e1", nameOf)).toBeNull();
  });
  it("sizes", () => {
    expect(dataUrlSize("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(fmtSize(500)).toBe("500 B");
    expect(fmtSize(820 * 1024)).toBe("820 KB");
    expect(fmtSize(1.4 * 1024 * 1024)).toBe("1.4 MB");
    expect(fmtSize(2 * 1024 * 1024)).toBe("2 MB");
  });
});
