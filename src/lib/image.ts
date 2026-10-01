/** Shrinks an image file/data URL to a JPEG data URL (default ~1100 px, quality .8). */
export function shrinkImage(src: File | string, maxDim = 1100, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { reject(new Error("bad image")); return; }
      const k = Math.min(1, maxDim / Math.max(w, h)), c = document.createElement("canvas");
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = url;
  });
}

const nearWhite = (d: Uint8ClampedArray, i: number) => d[i + 3] > 200 && d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;

/**
 * Prepares an uploaded logo (port of the prototype's prepareLogo): keeps transparency, optionally knocks out a white
 * background that touches the borders, trims empty margins, and scales so the longest side is `maxDim`. Returns a PNG data URL.
 */
export function prepareLogo(file: File, trim = true, maxDim = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) { reject(new Error("bad image")); return; }
      const pre = Math.min(1, 1600 / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * pre)), h = Math.max(1, Math.round(h0 * pre));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, w, h);
      let box = { l: 0, t: 0, r: w - 1, b: h - 1 };
      if (trim) {
        const id = x.getImageData(0, 0, w, h), d = id.data;
        // is the border white? then flood the white that touches it into transparency
        let edge = 0, white = 0;
        const probe = (px: number, py: number) => { edge++; if (nearWhite(d, (py * w + px) * 4)) white++; };
        for (let i = 0; i < w; i++) { probe(i, 0); probe(i, h - 1); }
        for (let j = 0; j < h; j++) { probe(0, j); probe(w - 1, j); }
        if (white / edge > 0.9) {
          const seen = new Uint8Array(w * h), stack: number[] = [];
          const push = (px: number, py: number) => { const k = py * w + px; if (!seen[k] && nearWhite(d, k * 4)) { seen[k] = 1; stack.push(k); } };
          for (let i = 0; i < w; i++) { push(i, 0); push(i, h - 1); }
          for (let j = 0; j < h; j++) { push(0, j); push(w - 1, j); }
          while (stack.length) {
            const k = stack.pop()!, px = k % w, py = (k - px) / w;
            d[k * 4 + 3] = 0;
            if (px > 0) push(px - 1, py); if (px < w - 1) push(px + 1, py); if (py > 0) push(px, py - 1); if (py < h - 1) push(px, py + 1);
          }
          x.putImageData(id, 0, 0);
        }
        let l = w, t = h, r = -1, b = -1;
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (d[(py * w + px) * 4 + 3] > 16) { if (px < l) l = px; if (px > r) r = px; if (py < t) t = py; if (py > b) b = py; }
        if (r >= l && b >= t) { const pad = 2; box = { l: Math.max(0, l - pad), t: Math.max(0, t - pad), r: Math.min(w - 1, r + pad), b: Math.min(h - 1, b + pad) }; }
      }
      const cw = box.r - box.l + 1, ch = box.b - box.t + 1, k = Math.min(1, maxDim / Math.max(cw, ch));
      const o = document.createElement("canvas"); o.width = Math.max(1, Math.round(cw * k)); o.height = Math.max(1, Math.round(ch * k));
      o.getContext("2d")!.drawImage(c, box.l, box.t, cw, ch, 0, 0, o.width, o.height);
      resolve(o.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

/** A profile photo: the middle square of the image, `size` px, as a JPEG data URL (small enough for 1 MB uploads). */
export function squareImage(file: File, size = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { reject(new Error("bad image")); return; }
      const side = Math.min(w, h), out = Math.min(size, side), c = document.createElement("canvas");
      c.width = out; c.height = out;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff"; x.fillRect(0, 0, out, out); // transparent PNGs get a white background, not black
      x.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}
