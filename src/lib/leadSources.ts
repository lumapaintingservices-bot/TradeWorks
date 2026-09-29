/** Where-did-the-lead-come-from list. The contractor's own list (Settings > Lead sources) or this starting list when empty. */
export const LEAD_SOURCE_FALLBACK = ["Thumbtack", "Google", "Referral", "Instagram", "Nextdoor", "Facebook", "Repeat client", "Walk-by / sign", "Other"];
export const leadSourceList = (s: { leadSources?: string[] }): string[] => (s.leadSources && s.leadSources.length ? s.leadSources : LEAD_SOURCE_FALLBACK);
