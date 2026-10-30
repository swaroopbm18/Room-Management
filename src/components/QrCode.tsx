import qrcode from "qrcode-generator";

/** A QR code for `text` as an inline SVG, drawn on the server (no image to load). */
export default function QrCode({ text, className }: { text: string; className?: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + 8} ${n + 8}`} className={className} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${text}`}>
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
