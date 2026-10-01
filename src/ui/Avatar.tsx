import { useState, type ReactNode } from "react";
import { avatarInitials, avatarTone, groupSplit, type AvatarTone } from "../lib/avatar";
import { Icon } from "./Icon";
import "./ui.css";

/**
 * Avatar (idea from shadcn/ui Avatar, plain CSS with our tokens): a person's photo, or their initials on a soft color
 * while it loads / when there is none / when it fails.
 *  - size xs 20 · sm 26 · default 34 · lg 46 · xl 64
 *  - tone: auto (a steady color per name), gray, acc, ink, or one of the colors
 *  - badge: a status dot on the bottom-right corner (ok / warn / bad / gray / acc); badgeIcon puts an icon in it
 *  - square: rounded square instead of a circle (the signed-in person, like shadcn's NavUser)
 */
export type AvatarSize = "xs" | "sm" | "default" | "lg" | "xl";
export type AvatarBadge = "ok" | "warn" | "bad" | "gray" | "acc";
type Props = {
  name?: string | null; src?: string | null; size?: AvatarSize; tone?: "auto" | "gray" | "acc" | "ink" | AvatarTone;
  square?: boolean; badge?: AvatarBadge | false | null; badgeIcon?: string; badgeLabel?: string;
  title?: string; className?: string; children?: ReactNode;
};

export function Avatar({ name, src, size = "default", tone = "auto", square, badge, badgeIcon, badgeLabel, title, className, children }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const t = tone === "auto" ? avatarTone(name) : tone;
  const cls = ["avt", "avt-" + size, "t-" + t, square && "sq", className].filter(Boolean).join(" ");
  const img = src && failed !== src;
  return (
    <span className={cls} title={title} aria-hidden={title ? undefined : true}>
      <span className="avt-f">{children ?? avatarInitials(name)}</span>
      {img && <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(src)} />}
      {badge && <span className={"avt-b b-" + badge + (badgeIcon ? " ic" : "")} role={badgeLabel ? "img" : undefined} aria-label={badgeLabel}>
        {badgeIcon && <Icon name={badgeIcon} size={10} />}</span>}
    </span>
  );
}

/** Overlapping avatars; past `max` the last circle says "+N". */
export function AvatarGroup({ people, max = 4, size = "sm", label, className }: {
  people: Array<string | { name: string; src?: string | null }>; max?: number; size?: AvatarSize; label?: string; className?: string;
}) {
  const list = people.map((p) => (typeof p === "string" ? { name: p } : p)).filter((p) => p.name);
  if (!list.length) return null;
  const { shown, more } = groupSplit(list, max);
  return (
    <span className={"avt-g" + (className ? " " + className : "")} role="img" aria-label={label || list.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => <Avatar key={i} name={p.name} src={"src" in p ? p.src : undefined} size={size} title={p.name} />)}
      {more > 0 && <AvatarGroupCount size={size} title={list.slice(shown.length).map((p) => p.name).join(", ")}>+{more}</AvatarGroupCount>}
    </span>
  );
}

/** The "+N" circle at the end of a group. */
export function AvatarGroupCount({ size = "sm", title, children }: { size?: AvatarSize; title?: string; children: ReactNode }) {
  return <Avatar size={size} tone="gray" title={title} className="avt-cnt">{children}</Avatar>;
}
