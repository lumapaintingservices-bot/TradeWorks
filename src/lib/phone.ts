/**
 * US phone numbers as you type (idea from shadcn studio's Phone Input): "5550102030" -> "(555) 010-2030".
 * Left alone: international numbers (+52…), anything with letters (ext. 12), more than 10 digits.
 * A leading US country code is kept short: "+1 555…" / "1555…" -> "(555) …".
 */
export function formatPhone(raw: string): string {
  const s = String(raw ?? "");
  if (!s.trim()) return "";
  if (/[a-z]/i.test(s)) return s;
  const t = s.trim();
  if (t.startsWith("+") && !t.startsWith("+1")) return s;
  let d = t.replace(/\D/g, "");
  if ((t.startsWith("+1") || (d.length === 11 && d.startsWith("1")))) d = d.slice(1);
  if (d.length > 10) return s;
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** What the field should show after a keystroke: format when typing at the end, keep deletions and mid-text edits as typed. */
export function phoneOnType(prev: string, next: string, caretAtEnd: boolean): string {
  return next.length > prev.length && caretAtEnd ? formatPhone(next) : next;
}
