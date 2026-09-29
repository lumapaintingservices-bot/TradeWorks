// TradeWorks design tokens for TypeScript (same values as tokens.css)
export const tokens = {
  color: {
    light: { bg:"#F5F6F8", surface:"#FFFFFF", surface2:"#F7F8FA", ink:"#0B0D12", ink2:"#4B5263", ink3:"#9097A3", line:"#ECEEF2", line2:"#F3F4F6",
             acc:"#1E6BFF", accSoft:"#EAF1FF", accInk:"#1550C9", ok:"#12B76A", bad:"#F04438", warn:"#F79009", primaryBtn:"#0B0D12" },
    dark:  { bg:"#0B0D12", surface:"#14171E", surface2:"#1A1E27", ink:"#F2F4F7", ink2:"#C3C8D1", ink3:"#7F8795", line:"#252B36", line2:"#1C212A",
             acc:"#4C8DFF", accSoft:"#16233F", accInk:"#8DB4FF", ok:"#12B76A", bad:"#F04438", warn:"#F79009", primaryBtn:"#F2F4F7" },
    tiles: { blue:["#EAF1FF","#1E6BFF"], green:["#ECFDF3","#12B76A"], purple:["#F4F0FF","#7A5AF8"], orange:["#FFF4ED","#EF6820"],
             pink:["#FDF2FA","#DD2590"], red:["#FEF3F2","#F04438"], teal:["#EFFCF9","#0E9384"], amber:["#FFFAEB","#DC6803"] },
    chart: { main:"#1E6BFF", compare:"#9097A3", grid:"#E4E7EC" },
    clientBrandDefault: "#EF6A2C",
  },
  space: { 1:4, 2:8, 3:12, 4:16, 5:24, 6:32 },
  radius: { sm:8, md:10, lg:12, card:16, modal:18, pill:999 },
  font: { family:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
          size:{ xs:11.5, sm:12.5, md:14, lg:15, h1:24, kpi:30 }, weight:{ regular:400, medium:500, semibold:600, bold:700 } },
  layout: { sidebarW:260, contentMax:1240, topbarH:56, bottomNavH:64, phoneBreakpoint:640, tabletBreakpoint:900 },
} as const;
export type Tokens = typeof tokens;
