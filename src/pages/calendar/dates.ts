import { num } from "../../lib/money";

export const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DOW_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const p2 = (n: number) => String(n).padStart(2, "0");
export const monthKey = (iso: string) => iso.slice(0, 7);
export const shiftMonth = (key: string, delta: number) => { const d = new Date(num(key.slice(0, 4)), num(key.slice(5, 7)) - 1 + delta, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
