/**
 * The app's confirm window (src/ui/confirm.tsx) is fed the same sentence the old browser confirm() showed.
 * This splits it into a title (the question) and the rest, picks the button word from the question's verb,
 * and tells whether the action destroys something (red button).
 */
export function splitQuestion(text: string): { title: string; body: string } {
  const s = text.trim();
  const q = s.indexOf("?");
  if (q < 0 || q === s.length - 1) return { title: s, body: "" };
  return { title: s.slice(0, q + 1).trim(), body: s.slice(q + 1).trim() };
}

const DANGER = /\b(delete|remove|clear|turn off|stop|dismiss|borrar|eliminar|quitar|desactivar|apagar|parar|descartar)\b/i;
export const isDanger = (text: string) => DANGER.test(text.split("?")[0]);

// question verb -> button text
const VERBS: [RegExp, string][] = [
  [/^¿?\s*(delete)\b/i, "Delete"], [/^¿?\s*(remove)\b/i, "Remove"], [/^¿?\s*(clear)\b/i, "Clear"], [/^¿?\s*(take)\b/i, "Take off"],
  [/^¿?\s*(turn off)\b/i, "Turn off"], [/^¿?\s*(stop)\b/i, "Stop"], [/^¿?\s*(restore)\b/i, "Restore"], [/^¿?\s*(switch)\b/i, "Switch"],
  [/^¿?\s*(use)\b/i, "Use"], [/^¿?\s*(reset)\b/i, "Reset"], [/^¿?\s*(put back)\b/i, "Put back"], [/^¿?\s*(make)\b/i, "Make it"],
  [/^¿?\s*(mark)\b/i, "Mark"], [/^¿?\s*(cancel)\b/i, "Yes, cancel"],
  [/^¿\s*(borrar)\b/i, "Borrar"], [/^¿\s*(eliminar)\b/i, "Eliminar"], [/^¿\s*(quitar)\b/i, "Quitar"], [/^¿\s*(desactivar)\b/i, "Desactivar"],
  [/^¿\s*(apagar)\b/i, "Apagar"], [/^¿\s*(parar)\b/i, "Parar"], [/^¿\s*(restaurar)\b/i, "Restaurar"], [/^¿\s*(cambiar)\b/i, "Cambiar"],
  [/^¿\s*(usar)\b/i, "Usar"], [/^¿\s*(restablecer)\b/i, "Restablecer"], [/^¿\s*(regresar)\b/i, "Regresar"], [/^¿\s*(crear)\b/i, "Crear"],
  [/^¿\s*(marcar)\b/i, "Marcar"], [/^¿\s*(dejar)\b/i, "Sí, dejar"], [/^¿\s*(cancelar)\b/i, "Sí, cancelar"],
];
/** The confirm button's text: the question's own verb ("Delete", "Quitar"…), else "Yes" / "Sí". */
export function okWord(text: string, es: boolean): string {
  const s = text.trim();
  for (const [re, word] of VERBS) if (re.test(s)) return word;
  return es ? "Sí" : "Yes";
}
