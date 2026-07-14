import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../../ozel-guvenlik/public/banners");
fs.mkdirSync(dir, { recursive: true });

const themes = [
  ["banner-1.jpg", "#0b1220", "#1e3a5f", "#d4a017"],
  ["banner-2.jpg", "#111827", "#7c2d12", "#f59e0b"],
  ["banner-3.jpg", "#0c1222", "#14532d", "#eab308"],
];

for (const [name, a, b, c] of themes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${a}"/>
    <stop offset="55%" stop-color="${b}"/>
    <stop offset="100%" stop-color="${c}"/>
  </linearGradient></defs>
  <rect width="1200" height="400" fill="url(#g)"/>
  <text x="60" y="175" font-family="Arial,sans-serif" font-size="52" font-weight="800" fill="#ffffff">OzelGuvenlik.online</text>
  <text x="60" y="235" font-family="Arial,sans-serif" font-size="28" font-weight="600" fill="#ffd85a">Turkiye'nin ozel guvenlik is ilanlari</text>
</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(dir, String(name)));
  console.log("ok", name);
}
