/** A texture as a PNG data URL, through a canvas. Browser only. */
export function dataURLFromImage(img: { width: number; height: number; data: Uint8ClampedArray }): string {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c.toDataURL('image/png');
}
