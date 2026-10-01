import { useId, useState } from "react";
import { useUi } from "../store/ui";
import "./ui.css";

// eye / eye-off, 24×24, stroke 1.8 (same grid as /design/icons.ts)
const EYE = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = '<path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.5M6.3 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>';

/** Password field with a show / hide button inside the box (idea from shadcn's Password Input). */
export function PasswordInput({ label, value, onChange, autoComplete, required }: {
  label: string; value: string; onChange(v: string): void; autoComplete?: string; required?: boolean;
}) {
  const es = useUi((s) => s.lang) === "es";
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="f pwf">
      <label htmlFor={id}>{label}</label>
      <div className="ig">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoComplete={autoComplete}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button type="button" className="ig-btn" aria-pressed={show} aria-controls={id}
          aria-label={show ? (es ? "Ocultar contraseña" : "Hide password") : (es ? "Mostrar contraseña" : "Show password")}
          title={show ? (es ? "Ocultar" : "Hide") : (es ? "Mostrar" : "Show")} onClick={() => setShow((v) => !v)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: show ? EYE_OFF : EYE }} />
        </button>
      </div>
    </div>
  );
}
