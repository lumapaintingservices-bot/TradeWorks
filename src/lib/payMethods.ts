/** Payment methods shown as chips on estimates / invoices (prototype payment.methods). Stored as a list of keys in settings.payMethods. */
export const PAY_METHODS = {
  cash: ["Cash", "Efectivo"], card: ["Credit card", "Tarjeta de crédito"], zelle: ["Zelle", "Zelle"], check: ["Check", "Cheque"],
} as const;
export type PayMethodKey = keyof typeof PAY_METHODS;
export const PAY_METHOD_KEYS = Object.keys(PAY_METHODS) as PayMethodKey[];
/** Undefined = never chosen = all four (like the prototype's default). */
export const payMethodsOf = (v?: string[]): PayMethodKey[] => (Array.isArray(v) ? v.filter((k): k is PayMethodKey => k in PAY_METHODS) : PAY_METHOD_KEYS);
