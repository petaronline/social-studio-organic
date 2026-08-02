'use client';

/**
 * Snapshot a board element to PNG or PDF, client-side.
 *
 * Uploaded images are same-origin (served via /api), so they inline cleanly.
 * A pasted external image URL that its host serves without CORS can't be read
 * into the canvas — html-to-image skips it rather than failing the whole
 * export, which is why the paste flow prefers fetching image bytes into an
 * upload.
 */

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 1×1 transparent PNG. Any image the exporter can't read into the canvas
// (a cross-origin host that blocks it — hotlinked pics, some link thumbnails)
// is swapped for this instead of tainting the canvas and failing the whole
// export. Same-origin uploads inline fine and render normally.
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function snapshot(el: HTMLElement): Promise<string> {
  return toPng(el, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#FBFBFD',
    imagePlaceholder: TRANSPARENT_PX,
    skipAutoScale: true,
  });
}

const safe = (name: string) => name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'moodboard';

export async function exportBoardPng(el: HTMLElement, name: string): Promise<void> {
  const dataUrl = await snapshot(el);
  triggerDownload(dataUrl, `${safe(name)}.png`);
}

export async function exportBoardPdf(el: HTMLElement, name: string): Promise<void> {
  const dataUrl = await snapshot(el);
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'px',
    format: [w, h],
    compress: true,
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
  pdf.save(`${safe(name)}.pdf`);
}
