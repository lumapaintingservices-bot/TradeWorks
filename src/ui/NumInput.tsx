import { useEffect, useState } from "react";
import { num } from "../lib/money";

/** Numeric field that lets you type "0." or clear it; emits numbers. */
export function NumInput({ value, onChange, step = "any", min = 0, ...rest }: { value: number; onChange(n: number): void; step?: string; min?: number; placeholder?: string; style?: React.CSSProperties; disabled?: boolean; id?: string; className?: string; "aria-label"?: string }) {
  const [txt, setTxt] = useState(value ? String(value) : "");
  useEffect(() => { if (num(txt) !== value) setTxt(value ? String(value) : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="number" inputMode="decimal" step={step} min={min} value={txt} {...rest}
    onChange={(e) => { setTxt(e.target.value); onChange(num(e.target.value)); }} />;
}
