import { useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { avatarFileProblem } from "../lib/avatar";
import { useUi } from "../store/ui";
import { Avatar } from "./Avatar";
import { ask } from "./confirm";
import { Icon } from "./Icon";
import "./ui.css";

/**
 * Profile photo with Upload / Change and Remove (idea from shadcn's Avatar + the "profile picture" pattern of shadcn
 * account settings): the big avatar (click it to pick a photo), the buttons and a hint. The photo is cropped to a square.
 * onFile / onRemove may be async: the avatar shows a spinner meanwhile. Removing asks first unless `confirmRemove` is false.
 */
export function AvatarPicker({ name, src, onFile, onRemove, confirmRemove = true, disabled, children }: {
  name: string; src?: string | null; onFile(file: File): Promise<void> | void; onRemove(): Promise<void> | void;
  confirmRemove?: boolean; disabled?: boolean; children?: ReactNode;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void> | void, fail: string) => {
    setBusy(true);
    try { await fn(); } catch { toast(fail); } finally { setBusy(false); }
  };
  const pick = (f?: File | null) => {
    if (!f) return;
    const bad = avatarFileProblem(f);
    if (bad === "type") { toast(t("Pick a photo (JPG, PNG or WEBP).", "Elige una foto (JPG, PNG o WEBP).")); return; }
    if (bad === "size") { toast(t("That photo is too big (20 MB max).", "Esa foto es muy grande (máximo 20 MB).")); return; }
    run(() => onFile(f), t("Couldn't save the photo. Try again.", "No se pudo guardar la foto. Intenta otra vez."));
  };
  const remove = async () => {
    if (confirmRemove) {
      if (!(await ask(t("Remove the photo? The initials show instead.", "¿Quitar la foto? Se mostrarán las iniciales.")))) return;
    }
    run(onRemove, t("Couldn't remove the photo. Try again.", "No se pudo quitar la foto. Intenta otra vez."));
  };
  const off = disabled || busy;
  return (
    <div className="avp">
      <button type="button" className="avp-face" disabled={off} onClick={() => input.current?.click()}
        aria-label={src ? t("Change photo", "Cambiar foto") : t("Upload photo", "Subir foto")}>
        <Avatar name={name} src={src} size="xl" />
        <span className="avp-cam" aria-hidden>{busy ? <span className="avp-spin" /> : <Icon name="camera" size={16} />}</span>
      </button>
      <div className="avp-r">
        {children && <div className="avp-who">{children}</div>}
        <div className="avp-btns">
          <button type="button" className="btn sm" disabled={off} onClick={() => input.current?.click()}>
            <Icon name="upload" size={15} />{src ? t("Change photo", "Cambiar foto") : t("Upload photo", "Subir foto")}</button>
          {src && <button type="button" className="btn sm danger" disabled={off} onClick={remove}><Icon name="trash" size={15} />{t("Remove", "Quitar")}</button>}
        </div>
        <p className="avp-hint">{busy ? t("Saving…", "Guardando…") : t("JPG, PNG or WEBP. It's cropped to a square.", "JPG, PNG o WEBP. Se recorta en cuadrado.")}</p>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
