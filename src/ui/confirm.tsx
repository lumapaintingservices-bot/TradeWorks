import { useEffect, useRef } from "react";
import { create } from "zustand";
import { isDanger, okWord, splitQuestion } from "../lib/confirmText";
import { useUi } from "../store/ui";
import "./ui.css";

type Req = { text: string; ok?: string; danger?: boolean; resolve(v: boolean): void };
const useAsk = create<{ req: Req | null }>(() => ({ req: null }));

/**
 * The app's own confirm window (idea from shadcn's Alert Dialog), instead of the browser's grey "localhost says…" box.
 * `if (!(await ask(t("Delete this note?", "¿Borrar esta nota?")))) return;`
 * The question becomes the title, the rest the explanation; delete / remove / clear… get a red button.
 */
export function ask(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useAsk.getState().req?.resolve(false); // a new question replaces an open one
    useAsk.setState({ req: { text, ...opts, resolve } });
  });
}

/** Mounted once (main.tsx). */
export function ConfirmHost() {
  const req = useAsk((s) => s.req);
  const es = useUi((s) => s.lang) === "es";
  const okBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const done = (v: boolean) => { req?.resolve(v); useAsk.setState({ req: null }); };
  useEffect(() => {
    if (!req) return;
    const danger = req.danger ?? isDanger(req.text);
    (danger ? cancelBtn : okBtn).current?.focus(); // a destructive action never gets Enter by accident
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); done(false); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!req) return null;
  const { title, body } = splitQuestion(req.text);
  const danger = req.danger ?? isDanger(req.text);
  return (
    <div className="ask-back" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="ask" role="alertdialog" aria-modal aria-labelledby="ask-t" aria-describedby={body ? "ask-b" : undefined}>
        <div className={"ask-ic" + (danger ? " bad" : "")} aria-hidden>{danger ? "!" : "?"}</div>
        <h2 id="ask-t">{title}</h2>
        {body && <p id="ask-b">{body}</p>}
        <div className="ask-act">
          <button ref={cancelBtn} className="btn" onClick={() => done(false)}>{es ? "Cancelar" : "Cancel"}</button>
          <button ref={okBtn} className={"btn " + (danger ? "ask-danger" : "pri")} onClick={() => done(true)}>{req.ok || okWord(req.text, es)}</button>
        </div>
      </div>
    </div>
  );
}
