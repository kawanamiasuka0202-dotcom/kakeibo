/**
 * PWA 用のアイコン PNG を生成する。
 *   node scripts/generate-icons.mjs
 *
 * 外部ライブラリを使わず、Node 標準の zlib だけで PNG を書き出す。
 * デザイン: 落ち着いた緑の背景に、白い棒グラフ（家計簿らしさ）と下線。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

const BG = [47, 125, 111]; // #2f7d6f
const FG = [255, 255, 255];

// --- PNG エンコーダ ---------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // フィルタなし
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 描画 -------------------------------------------------------------------
function createCanvas(size) {
  const data = Buffer.alloc(size * size * 4);
  return {
    size,
    data,
    set(x, y, [r, g, b], a = 255) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      const alpha = a / 255;
      data[i] = Math.round(data[i] * (1 - alpha) + r * alpha);
      data[i + 1] = Math.round(data[i + 1] * (1 - alpha) + g * alpha);
      data[i + 2] = Math.round(data[i + 2] * (1 - alpha) + b * alpha);
      data[i + 3] = Math.max(data[i + 3], a);
    },
  };
}

function fillRoundRect(canvas, x0, y0, w, h, radius, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - radius - 1), 0);
      const dy = Math.max(y0 + radius - y, y - (y0 + h - radius - 1), 0);
      const dist = Math.hypot(dx, dy);
      if (dist <= radius) canvas.set(x, y, color, 255);
      else if (dist <= radius + 1) canvas.set(x, y, color, Math.round((radius + 1 - dist) * 255));
    }
  }
}

function drawIcon(size, { padding = 0 } = {}) {
  const canvas = createCanvas(size);
  const inset = size * padding;
  const boxSize = size - inset * 2;

  fillRoundRect(canvas, inset, inset, boxSize, boxSize, boxSize * 0.22, BG);

  // 棒グラフ 3本 + 下線
  const barWidth = boxSize * 0.13;
  const gap = boxSize * 0.075;
  const baseY = inset + boxSize * 0.72;
  const heights = [0.2, 0.34, 0.46];
  const totalWidth = barWidth * 3 + gap * 2;
  let x = inset + (boxSize - totalWidth) / 2;
  for (const h of heights) {
    const barHeight = boxSize * h;
    fillRoundRect(canvas, x, baseY - barHeight, barWidth, barHeight, barWidth * 0.35, FG);
    x += barWidth + gap;
  }
  fillRoundRect(
    canvas,
    inset + boxSize * 0.22,
    baseY + boxSize * 0.035,
    boxSize * 0.56,
    boxSize * 0.055,
    boxSize * 0.03,
    FG,
  );

  return encodePng(size, size, canvas.data);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  // maskable はセーフゾーン確保のため内側に余白をとる
  ['icon-maskable-512.png', drawIcon(512, { padding: 0.1 })],
  ['apple-touch-icon.png', drawIcon(180)],
  ['favicon-32.png', drawIcon(32)],
];

for (const [name, buffer] of files) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`generated: public/icons/${name} (${buffer.length} bytes)`);
}
