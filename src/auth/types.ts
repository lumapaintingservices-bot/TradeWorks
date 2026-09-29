export type User = { uid: string; name: string; email: string };
export type Company = {
  id: string; name: string; phone: string; email: string; website: string; area: string; logoUrl: string;
  brandColor: string; trade: string; ownerUid: string;
  pricing: { door: number; drawer: number; depositPct: number };
  onboarded: boolean;
};
