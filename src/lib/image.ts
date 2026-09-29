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
