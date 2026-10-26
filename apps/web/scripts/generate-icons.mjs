#!/usr/bin/env node
/**
 * Generates placeholder PNG icons for the PWA manifest (192/512), so the
 * starter runs cleanly without binary assets in git.
 *
 * Usage: node scripts/generate-icons.mjs   (apps/web/static/*.png)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sizes = [192, 512];
const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "static",
);

// Tiny 1x1 dark PNG scaled up via IHDR — good enough as a placeholder.
function placeholderPng(size) {
  const width = size;
  const height = size;

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput) >>> 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const raw = Buffer.alloc(height * (width * 3 + 1), 0x1d);
  for (let row = 0; row < height; row++) raw[row * (width * 3 + 1)] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

import zlib from "node:zlib";

for (const size of sizes) {
  const file = path.join(outDir, `icon-${size}.png`);
  await writeFile(file, placeholderPng(size));
  console.log("wrote", file);
}
