import type { InputHTMLAttributes } from "react";
import { formatPhone, phoneOnType } from "../lib/phone";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string; onChange(v: string): void };

/** A phone field that writes US numbers as (555) 010-2030 while you type, and tidies the number when you leave the field. */
export function PhoneInput({ value, onChange, onBlur, ...rest }: Props) {
  return (
    <input type="tel" inputMode="tel" autoComplete="tel" {...rest} value={value || ""}
      onChange={(e) => { const el = e.target; onChange(phoneOnType(value || "", el.value, el.selectionStart === el.value.length)); }}
      onBlur={(e) => { const f = formatPhone(value || ""); if (f !== (value || "")) onChange(f); onBlur?.(e); }} />
  );
}
