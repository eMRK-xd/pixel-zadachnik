// Draws the app icon: the app's own pixel sun-eye (gold, dark pupil) on a round night disc with a thin gold ring; transparent outside.
// 32x32 pixel art, upscaled nearest-neighbour into icon.ico (16/32/48/256) + icon.png (+ web/ icons for the phone)
const fs = require("fs"), zlib = require("zlib"), path = require("path");

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const C = { bg: hex("#05070b"), bg2: hex("#0b111b"), ring: hex("#d4a640"), eye: hex("#e0b13e"), pupil: hex("#0e1a2b"), frame: hex("#7a5a22"), frameHi: hex("#c99b3f") };
const N = 32, px = Array.from({ length: N }, () => Array(N).fill(null));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y][x] = c; };
const cx = 15.5, cy = 15.5;

// round night disc inside a thin gold ring; nothing outside it
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const d = Math.hypot(x - cx, y - cy);
  if (d < 12.3) set(x, y, d > 10.5 && (x + y) % 2 ? C.bg2 : C.bg);
  else if (d < 13.5) set(x, y, C.ring);
}
// the "Солнце" eye skin from the app (11x9), drawn at 2x, pupil = 2x2 cells
const SUN = [".....X.....", "..X..X..X..", "...XXXXX...", ".XXXXXXXXX.", "XXXXXXXXXXX", ".XXXXXXXXX.", "...XXXXX...", "..X..X..X..", ".....X....."];
const x0 = 5, y0 = 7;
SUN.forEach((r, yy) => [...r].forEach((c, xx) => { if (c === "X") for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) set(x0 + xx * 2 + a, y0 + yy * 2 + b, C.eye); }));
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) set(x0 + 9 + a, y0 + 7 + b, C.pupil);

function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = px[Math.floor(y * N / size)][Math.floor(x * N / size)], i = y * (size * 4 + 1) + 1 + x * 4;
      if (c) { raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const sizes = [16, 32, 48, 256], imgs = sizes.map(png);
const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => { const e = 6 + i * 16; head[e] = s % 256; head[e + 1] = s % 256; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += imgs[i].length; });
fs.writeFileSync(path.join(__dirname, "icon.ico"), Buffer.concat([head, ...imgs]));
fs.writeFileSync(path.join(__dirname, "icon.png"), imgs[3]);
// the desktop build reads its icons from src-tauri/icons
fs.copyFileSync(path.join(__dirname, "icon.ico"), path.join(__dirname, "src-tauri", "icons", "icon.ico"));
fs.copyFileSync(path.join(__dirname, "icon.png"), path.join(__dirname, "src-tauri", "icons", "icon.png"));
// PWA icons for the phone version (web/)
for (const n of [192, 512]) fs.writeFileSync(path.join(__dirname, "web", "icon-" + n + ".png"), png(n));
// Android launcher: adaptive icon = black background layer + this emblem on a transparent foreground (inside the 66/108 safe zone),
// and a legacy square icon on black, so launchers never fill the transparent corners with white
function pngPlaced(size, scale, bg) {
  const raw = Buffer.alloc(size * (size * 4 + 1)), off = Math.floor((size - N * scale) / 2);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - off) / scale), gy = Math.floor((y - off) / scale), i = y * (size * 4 + 1) + 1 + x * 4;
      const c = gx >= 0 && gy >= 0 && gx < N && gy < N ? px[gy][gx] : null, col = c || bg;
      if (col) { raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
fs.mkdirSync(path.join(__dirname, "mobile", "icons"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "mobile", "icons", "ic_launcher_foreground.png"), pngPlaced(432, 8, null)); // 256px emblem centred in 432
fs.writeFileSync(path.join(__dirname, "mobile", "icons", "ic_launcher.png"), pngPlaced(192, 5, [0, 0, 0]));        // legacy: emblem on black
console.log("icon.ico written");
