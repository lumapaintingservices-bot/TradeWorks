import { ICONS } from "../design/icons";

type Group = keyof typeof ICONS;
export function Icon({ name, group = "nav", size = 20 }: { name: string; group?: Group; size?: number }) {
  const body = (ICONS[group] as Record<string, string>)[name] ?? (ICONS.nav as Record<string, string>)[name] ?? "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: body }} />
  );
}
