/**
 * Quick search (Ctrl/Cmd+K): finds clients, estimates, invoices, notes and pages by any word you type.
 * Accents and case don't matter ("garcia" finds "García"); phone numbers match by digits.
 */
export type SearchItem = { id: string; group: SearchGroup; title: string; sub?: string; to: string; words: string[] };
export type SearchGroup = "pages" | "clients" | "estimates" | "invoices" | "notes";
export const SEARCH_GROUPS: SearchGroup[] = ["pages", "clients", "estimates", "invoices", "notes"];

export const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const digits = (s: string) => s.replace(/\D/g, "");

/** How well an item matches: 0 = no. Every typed word must match one of the item's words (start of a word scores higher). */
export function scoreItem(item: Pick<SearchItem, "title" | "words">, q: string): number {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const fields = [item.title, ...item.words].map(fold).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    let best = 0;
    const dq = digits(term);
    for (const [i, f] of fields.entries()) {
      const at = f.indexOf(term);
      let s = 0;
      if (at === 0) s = 3;
      else if (at > 0) s = /[\s\-·,./#]/.test(f[at - 1]) ? 2.5 : 1;
      else if (dq.length >= 3 && digits(f).includes(dq)) s = 2;
      if (s && i === 0) s += 0.5; // the title counts a bit more
      best = Math.max(best, s);
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}

/** The best matches, grouped in a fixed order, at most `per` per group. */
export function searchAll(items: SearchItem[], q: string, per = 5): { group: SearchGroup; items: SearchItem[] }[] {
  if (!fold(q)) return [];
  const scored = items.map((it) => ({ it, s: scoreItem(it, q) })).filter((x) => x.s > 0);
  return SEARCH_GROUPS.map((group) => ({
    group,
    items: scored.filter((x) => x.it.group === group).sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title)).slice(0, per).map((x) => x.it),
  })).filter((g) => g.items.length);
}
