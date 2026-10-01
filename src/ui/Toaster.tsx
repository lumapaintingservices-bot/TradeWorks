import { useUi } from "../store/ui";
import { Icon } from "./Icon";
import "./ui.css";

const ERR = /couldn['’]t|could not|can['’]t|failed|error|no se pudo|no se puede|falló|fallo/i;

/** The app's toast (idea from shadcn's Sonner): icon, message, optional "Undo", close button. One at a time. */
export function Toaster() {
  const msg = useUi((s) => s.toastMsg), opts = useUi((s) => s.toastOpts), id = useUi((s) => s.toastId);
  const close = useUi((s) => s.closeToast);
  const es = useUi((s) => s.lang) === "es";
  if (!msg) return null;
  const err = (opts.kind ?? (ERR.test(msg) ? "err" : "ok")) === "err";
  return (
    <div key={id} className={"toast tw-toast" + (err ? " err" : "")} role={err ? "alert" : "status"}>
      <span className="tt-ic" aria-hidden>{err ? "!" : <Icon name="check" size={14} />}</span>
      <span className="tt-msg">{msg}</span>
      {opts.undo && <button className="tt-undo" onClick={() => { const u = opts.undo; close(); u?.(); }}>{es ? "Deshacer" : "Undo"}</button>}
      <button className="tt-x" onClick={close} aria-label={es ? "Cerrar" : "Close"}><Icon name="x" size={14} /></button>
    </div>
  );
}
