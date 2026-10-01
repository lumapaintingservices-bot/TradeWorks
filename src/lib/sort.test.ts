import { describe, expect, it } from "vitest";
import { nextSort, sortRows } from "./sort";

describe("table sorting", () => {
  it("sorts numbers, text with numbers, and keeps empties last", () => {
    expect(sortRows([3, 10, 2], (x) => x, "asc")).toEqual([2, 3, 10]);
    expect(sortRows(["EST-1002", "EST-999", "EST-1000"], (x) => x, "asc")).toEqual(["EST-999", "EST-1000", "EST-1002"]);
    expect(sortRows(["b", "", "A", "c"], (x) => x, "desc")).toEqual(["c", "b", "A", ""]);
    expect(sortRows([{ n: null }, { n: 5 }, { n: 1 }], (x) => x.n, "asc").map((x) => x.n)).toEqual([1, 5, null]);
  });
  it("keeps the original order for ties and does not change the input", () => {
    const rows = [{ k: 1, id: "a" }, { k: 1, id: "b" }, { k: 0, id: "c" }];
    expect(sortRows(rows, (x) => x.k, "desc").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(rows.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("cycles a column: natural order, flipped, off", () => {
    expect(nextSort(null, "amount", "desc")).toEqual({ key: "amount", dir: "desc" });
    expect(nextSort({ key: "amount", dir: "desc" }, "amount", "desc")).toEqual({ key: "amount", dir: "asc" });
    expect(nextSort({ key: "amount", dir: "asc" }, "amount", "desc")).toBeNull();
    expect(nextSort({ key: "amount", dir: "asc" }, "client", "asc")).toEqual({ key: "client", dir: "asc" });
  });
});
