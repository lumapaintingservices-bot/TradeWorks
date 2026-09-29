/** Tiny Blob download helper: saves `text` as a file through a temporary link (port of the prototype's downloadCSV). */
export function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = fileName; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** File-name-safe company prefix: "LUMA Painting Services" -> "LUMA-Painting-Services" (falls back to "TradeWorks"). */
export function filePrefix(name?: string): string {
  const s = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "TradeWorks";
}
