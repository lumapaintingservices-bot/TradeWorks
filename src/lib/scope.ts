/** Scope-of-work text → structured list (ported from nl2list / isScopeHead / scopeGroups). */
const NL_ABBR = /(?:\b(?:sq|ft|in|ea|approx|aprox|no|nos|vs|etc|est|inc|corp|co|ltd|mr|mrs|ms|dr|jr|sr|st|rd|ave|apt|ste|pkg|qty|max|min|hr|hrs|lb|lbs|oz|gal|gals|yd|yds|yr|yrs|am|pm|ref|dept|sra|srta|av|ud|uds|pag|num|art)\.|(?:^|\s)[A-Za-z]\.)$/i;
const nlNextOk = (c: string) => /[A-ZÀ-ÖØ-Þ¿¡"'(“‘•–—\-#0-9]/.test(c);

export function nlSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0, i = 0;
  const n = line.length;
  while (i < n) {
    const c = line.charAt(i);
    if (c === "." || c === "!" || c === "?") {
      let j = i;
      while (j + 1 < n && ".!?".indexOf(line.charAt(j + 1)) >= 0) j++;
      let k = j + 1;
      while (k < n && ")]}\"'”’".indexOf(line.charAt(k)) >= 0) k++;
      let w = k;
      while (w < n && /\s/.test(line.charAt(w))) w++;
      if (w > k && w < n && nlNextOk(line.charAt(w))) {
        const chunk = line.slice(start, k).replace(/\s+$/, "");
        const marker = /^[(\[]?\d{1,3}[.)\]]$/.test(chunk.replace(/^[\s•\-–—*]+/, ""));
        if (!marker && !NL_ABBR.test(chunk)) {
          const t = chunk.trim();
          if (t) out.push(t);
          start = w; i = w; continue;
        }
      }
      i = k; continue;
    }
    i++;
  }
  const last = line.slice(start).trim();
  if (last) out.push(last);
  return out;
}

export function nl2list(s: string): string[] {
  const out: string[] = [];
  String(s || "").split("\n").forEach((line) => {
    line = line.replace(/^[\s•·*–—]+/, "").replace(/^-\s+/, "").trim();
    if (!line) return;
    nlSentences(line).forEach((p) => { if (p) out.push(p); });
  });
  return out;
}

export const SCOPE_DAY_RE = /^(day|d[ií]a)\s*(\d+)\s*[—–:\-.]*\s*(.*)$/i;
export function isScopeHead(x: string): boolean {
  x = String(x || "").trim();
  if (!x || x.length > 70) return false;
  if (/:$/.test(x)) return true;
  if (/[.!?]$/.test(x)) return false;
  if (SCOPE_DAY_RE.test(x)) return true;
  const letters = x.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}
export type ScopeGroup = { head: string; day: string; title: string; items: string[] };
export function scopeGroups(list: string[]): ScopeGroup[] {
  const out: ScopeGroup[] = [];
  let cur: ScopeGroup | null = null;
  list.forEach((x) => {
    if (isScopeHead(x)) {
      const m = SCOPE_DAY_RE.exec(x.trim());
      cur = { head: x.replace(/:$/, ""), day: m ? m[2] : "", title: m ? m[3] || x : x.replace(/:$/, ""), items: [] };
      out.push(cur);
    } else {
      if (!cur) { cur = { head: "", day: "", title: "", items: [] }; out.push(cur); }
      cur.items.push(x);
    }
  });
  return out;
}
