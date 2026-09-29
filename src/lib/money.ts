/** Number helpers ported 1:1 from the prototype (num, r2, money). */
export const num = (v: unknown): number => { const n = parseFloat(String(v)); return isFinite(n) ? n : 0; };
export const r2 = (x: unknown): number => Math.round(num(x) * 100) / 100;
export function money(n: unknown): string {
  const v = Math.round(num(n) * 100) / 100;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (v < 0 ? "-$" : "$") + s;
}
