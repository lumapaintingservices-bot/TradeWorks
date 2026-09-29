import { useT } from "../i18n";
import { roleLabel, type Role } from "../lib/roles";

const TONE: Record<Role, string> = { owner: "b-green", admin: "b-blue", worker: "b-gray" };
/** Small pill: Owner / Admin / Worker (Dueño / Administrador / Trabajador). */
export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  const [en, es] = roleLabel(role);
  return <span className={`badge ${TONE[role]}`}>{t(en, es)}</span>;
}
