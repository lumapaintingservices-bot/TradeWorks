import { useT } from "../i18n";
import { roleLabel, type Role } from "../lib/roles";
import { Badge, type BadgeTone } from "../ui/Badge";

const TONE: Record<Role, BadgeTone> = { owner: "green", admin: "blue", worker: "gray" };
/** Small pill: Owner / Admin / Worker (Dueño / Administrador / Trabajador). */
export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  const [en, es] = roleLabel(role);
  return <Badge tone={TONE[role]}>{t(en, es)}</Badge>;
}
