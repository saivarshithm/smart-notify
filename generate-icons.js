import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, r, g, b, a) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdr = makeChunk('IHDR', ihdrData);

  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = width * 0.45;

      if (dist < radius) {
        const factor = 1 - (dist / radius) * 0.3;
        rawData[pixelOffset] = Math.min(255, Math.floor(r * factor));
        rawData[pixelOffset + 1] = Math.min(255, Math.floor(g * factor));
        rawData[pixelOffset + 2] = Math.min(255, Math.floor(b * factor));
        rawData[pixelOffset + 3] = a;
      } else {
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  let offset = 6 + pngBuffers.length * 16;
  const entries = [];

  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

const icon32 = createPng(32, 32, 99, 102, 241, 255);
const icon128 = createPng(128, 128, 99, 102, 241, 255);
const icon256 = createPng(256, 256, 99, 102, 241, 255);
const ico = createIco([
  { width: 32, height: 32, buffer: icon32 },
  { width: 128, height: 128, buffer: icon128 },
]);

const tauriIconsDir = path.resolve('src-tauri/icons');
fs.writeFileSync(path.join(tauriIconsDir, '32x32.png'), icon32);
fs.writeFileSync(path.join(tauriIconsDir, '128x128.png'), icon128);
fs.writeFileSync(path.join(tauriIconsDir, '128x128@2x.png'), icon256);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.png'), icon256);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(tauriIconsDir, 'icon.icns'), icon256);

const msixDir = path.resolve('sparse-package/Assets');
fs.writeFileSync(path.join(msixDir, 'Square44x44Logo.png'), createPng(44, 44, 99, 102, 241, 255));
fs.writeFileSync(path.join(msixDir, 'Square150x150Logo.png'), createPng(150, 150, 99, 102, 241, 255));
fs.writeFileSync(path.join(msixDir, 'StoreLogo.png'), createPng(50, 50, 99, 102, 241, 255));
fs.writeFileSync(path.join(msixDir, 'SplashScreen.png'), createPng(620, 300, 99, 102, 241, 255));

console.log('All icons and assets generated successfully.');
