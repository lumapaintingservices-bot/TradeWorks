import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PadHandle = { clear(): void; dirty(): boolean; data(): string };

/** Finger / mouse signature. Returns a small PNG data URL. */
export const SignaturePad = forwardRef<PadHandle, { onChange?(dirty: boolean): void; height?: number }>(function SignaturePad({ onChange, height = 160 }, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const state = useRef({ drawing: false, dirty: false, last: [0, 0] as [number, number] });

  useEffect(() => {
    const c = cv.current!, ctx = c.getContext("2d")!;
    const fit = () => { const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; ctx.scale(d, d); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0B0D12"; };
    fit();
    const pos = (e: PointerEvent): [number, number] => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e: PointerEvent) => { e.preventDefault(); c.setPointerCapture(e.pointerId); state.current.drawing = true; state.current.last = pos(e); ctx.beginPath(); ctx.arc(...state.current.last, 0.8, 0, 6.3); ctx.stroke(); };
    const move = (e: PointerEvent) => {
      if (!state.current.drawing) return;
      e.preventDefault();
      const p = pos(e); ctx.beginPath(); ctx.moveTo(...state.current.last); ctx.lineTo(...p); ctx.stroke(); state.current.last = p;
      if (!state.current.dirty) { state.current.dirty = true; onChange?.(true); }
    };
    const up = () => { state.current.drawing = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    clear() { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); state.current.dirty = false; onChange?.(false); },
    dirty: () => state.current.dirty,
    data() {
      const c = cv.current!, out = document.createElement("canvas"), k = Math.min(1, 600 / c.width);
      out.width = c.width * k; out.height = c.height * k;
      out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  }));
  return <canvas ref={cv} style={{ width: "100%", height, touchAction: "none", border: "1px dashed #B8BDC7", borderRadius: 12, background: "#fff", display: "block" }} aria-label="Signature" />;
});
