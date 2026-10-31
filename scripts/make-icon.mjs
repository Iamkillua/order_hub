// Generates build/icon.png (512×512): blurple rounded square with a white parcel. Run: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 512;
const px = new Float32Array(S * S * 4);

const inRounded = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), S - r);
  const cy = Math.min(Math.max(y, r), S - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Isometric parcel, centred.
const top = [[256, 112], [392, 176], [256, 240], [120, 176]];
const left = [[120, 176], [256, 240], [256, 404], [120, 340]];
const right = [[256, 240], [392, 176], [392, 340], [256, 404]];
const tape = [[188, 144], [324, 208], [324, 248], [292, 233], [292, 225], [188, 176]];

const shade = (x, y) => {
  if (!inRounded(x, y, 112)) return null;
  if (inPoly(x, y, tape)) return [240, 178, 50];
  if (inPoly(x, y, top)) return [255, 255, 255];
  if (inPoly(x, y, left)) return [226, 229, 255];
  if (inPoly(x, y, right)) return [196, 201, 252];
  return [88, 101, 242];
};

const SS = 4; // supersampling
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (y * S + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = (a / (SS * SS)) * 255;
  }
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S * 4; x++) raw[y * (S * 4 + 1) + 1 + x] = Math.round(px[y * S * 4 + x]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6;

mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
writeFileSync(new URL('../build/icon.png', import.meta.url), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]));
console.log('wrote build/icon.png');
