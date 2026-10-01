import { describe, expect, it } from "vitest";
import { fold, scoreItem, searchAll, type SearchItem } from "./search";

const it_ = (id: string, group: SearchItem["group"], title: string, words: string[] = []): SearchItem => ({ id, group, title, to: "/" + id, words });
const items = [
  it_("c1", "clients", "Ana García", ["(555) 010-2030", "ana@example.com", "12 Oak St"]),
  it_("c2", "clients", "Bob Smith", ["bob@example.com"]),
  it_("e1", "estimates", "EST-1001 · Ana García", ["12 Oak St", "Kitchen cabinets"]),
  it_("i1", "invoices", "INV-1001 · Ana García", ["$537.50"]),
  it_("n1", "notes", "Buy tape", ["Frog tape for Ana"]),
  it_("p1", "pages", "Calendar", ["Calendario"]),
];

describe("quick search", () => {
  it("ignores accents and case", () => {
    expect(fold("García  ")).toBe("garcia");
    expect(scoreItem(items[0], "GARCIA")).toBeGreaterThan(0);
  });
  it("needs every word to match", () => {
    expect(scoreItem(items[0], "ana oak")).toBeGreaterThan(0);
    expect(scoreItem(items[0], "ana pine")).toBe(0);
  });
  it("matches phone numbers by digits", () => {
    expect(scoreItem(items[0], "5550102030")).toBeGreaterThan(0);
    expect(scoreItem(items[0], "010-20")).toBeGreaterThan(0);
  });
  it("finds estimates and invoices by number", () => {
    const r = searchAll(items, "1001");
    expect(r.map((g) => g.group)).toEqual(["estimates", "invoices"]);
  });
  it("groups results in a fixed order with the best first", () => {
    const r = searchAll(items, "ana");
    expect(r.map((g) => g.group)).toEqual(["clients", "estimates", "invoices", "notes"]);
    expect(r[0].items.map((x) => x.id)).toEqual(["c1"]);
  });
  it("finds pages in either language and nothing for an empty query", () => {
    expect(searchAll(items, "calendario")[0].items[0].id).toBe("p1");
    expect(searchAll(items, "   ")).toEqual([]);
  });
  it("caps each group", () => {
    const many = Array.from({ length: 9 }, (_, i) => it_("x" + i, "clients", "Ana " + i));
    expect(searchAll(many, "ana", 5)[0].items.length).toBe(5);
  });
});
