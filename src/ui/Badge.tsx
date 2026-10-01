import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

/**
 * Badge: one small pill for the whole app (idea from shadcn/ui Badge, plain CSS with our tokens, light + dark).
 *  - variant (shadcn): default (dark), secondary (gray), destructive (red), outline, ghost, link; overlay = on top of a photo
 *  - tone: our soft status colors (gray, blue, purple, green, teal, red, amber, acc) — wins over variant
 *  - dot (status dot), icon / iconEnd (icon names from design/icons), spinner (something in progress)
 *  - to (app link), href (outside link), onClick (button): the badge becomes clickable
 */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "overlay";
export type BadgeTone = "gray" | "blue" | "purple" | "green" | "teal" | "red" | "amber" | "acc";
type Props = {
  variant?: BadgeVariant; tone?: BadgeTone; size?: "sm" | "md";
  dot?: boolean; icon?: string; iconEnd?: string; spinner?: boolean;
  to?: string; href?: string; onClick?: () => void;
  title?: string; className?: string; style?: CSSProperties; children?: ReactNode;
};

export function Badge({ variant = "secondary", tone, size = "md", dot, icon, iconEnd, spinner, to, href, onClick, title, className, style, children }: Props) {
  const cls = ["badge", tone ? "b-" + tone : "b-" + variant, size === "sm" && "b-sm", className].filter(Boolean).join(" ");
  const ic = size === "sm" ? 11 : 13;
  const body = <>
    {spinner ? <span className="b-spin" aria-hidden /> : dot ? <i aria-hidden /> : icon ? <Icon name={icon} size={ic} /> : null}
    {children !== undefined && <span className="b-txt">{children}</span>}
    {iconEnd && <Icon name={iconEnd} size={ic} />}
  </>;
  if (to) return <Link to={to} className={cls} title={title} style={style}>{body}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls} title={title} style={style}>{body}</a>;
  if (onClick) return <button type="button" className={cls} title={title} style={style} onClick={onClick}>{body}</button>;
  return <span className={cls} title={title} style={style}>{body}</span>;
}
