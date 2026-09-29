import type { Estimate, Settings } from "../../lib/types";
export type TabProps = { e: Estimate; set(patch: Partial<Estimate>): void; s: Settings; lang: "en" | "es" };
