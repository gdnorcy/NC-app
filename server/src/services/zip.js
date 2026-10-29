/**
 * 最小 ZIP 打包器（store 模式，不压缩）。
 *
 * 🔴 为什么不用 archiver/jszip：那是两个新依赖 → 部署面变大（服务器 npm install 失败 = 整个防伪模块挂）。
 *    防伪码包本质是**文本 + 内联 SVG**，SVG 已自带 deflate 压缩，再套 zip 压缩收益极小；
 *    store 模式（method=0）零依赖即可产出**标准 zip 文件**（Excel/解压工具都能开）。
 *
 * 规格：ZIP local file header + central directory + EOCD，CRC-32 走 zlib.crc32。
 * 仅支持单文件（对标的码包也只装一个 txt）→ 不做目录树。
 */
import { crc32 } from 'node:zlib';

function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v & 0xffff, 0);
  return b;
}

function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
}

/**
 * @param {string} filename 压缩包内的文件名
 * @param {string|Buffer} content 内容
 * @returns {Buffer} zip 文件字节
 */
/**
 * 多文件 ZIP 打包（store 模式，不压缩）。
 * 🔴 为什么从单文件扩展到多文件：H1 二维码大批量导出需要「一个压缩包里每码一张 SVG +
 *    目录页 + 清单」，单文件 makeZip 表达不了。手工拼 local file header + central directory + EOCD，
 *    零依赖（node:zlib.crc32）。
 *
 * @param {Array<{name:string, data:string|Buffer}>} entries
 * @returns {Buffer} zip 字节
 */
export function makeMultiZip(entries) {
  const files = entries.map((e) => ({
    nameBuf: Buffer.from(String(e.name), 'utf8'),
    data: Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8'),
  }));
  const dosTime = 0;
  const dosDate = 33; // 1980-01-01
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const f of files) {
    const crc = crc32(f.data) >>> 0;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate), u32(crc),
      u32(f.data.length), u32(f.data.length),
      u16(f.nameBuf.length), u16(0),
      f.nameBuf, f.data, // 🔴 文件内容本体（漏了这行 → zip 里没有数据，unzip 报 bad CRC）
    ]);
    localParts.push(local);
    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate), u32(crc),
      u32(f.data.length), u32(f.data.length),
      u16(f.nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0),
      u32(offset), f.nameBuf,
    ]));
    offset += local.length;
  }
  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralBuf.length), u32(localBuf.length), u16(0),
  ]);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

export function makeZip(filename, content) {
  return makeMultiZip([{ name: filename, data: content }]);
}

/**
 * 解包多文件 zip（仅供测试/排障）：返回所有条目的 {name, text, size, crcOk, method}。
 * 🔴 store 模式（method=0）才解压 text；其它压缩方式返回 method≠0 的条目但不解压。
 */
export function readMultiZip(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const out = [];
  let p = 0;
  while (p + 4 <= b.length && b.readUInt32LE(p) === 0x04034b50) {
    const method = b.readUInt16LE(p + 8);
    const crc = b.readUInt32LE(p + 14);
    const csize = b.readUInt32LE(p + 18);
    const usize = b.readUInt32LE(p + 22);
    const nlen = b.readUInt16LE(p + 26);
    const elen = b.readUInt16LE(p + 28);
    const name = b.subarray(p + 30, p + 30 + nlen).toString('utf8');
    const data = b.subarray(p + 30 + nlen + elen, p + 30 + nlen + elen + csize);
    out.push({ name, text: data.toString('utf8'), size: usize, crcOk: (crc32(data) >>> 0) === (crc >>> 0), method });
    p += 30 + nlen + elen + csize;
  }
  return out;
}

/**
 * 解包（仅供测试与排障使用）：从 zip 字节里读出唯一那一个文件的「名字 + 文本内容」。
 *
 * 🔴 为什么不直接在测试里跑 `unzip` 命令：那会让测试依赖外部二进制（CI/服务器上不一定有 unzip），
 *    跨平台也不稳。这里自带解包器 → 纯 Node 断言，跑到哪都能验。
 *
 * @param {Buffer} buf zip 字节
 * @returns {{name: string, text: string, crcOk: boolean}|null}
 */
export function readZipEntry(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  // local file header: sig(4) ver(2) flags(2) method(2) time(2) date(2) crc(4) csize(4) usize(4) nlen(2) elen(2)
  const sig = b.readUInt32LE(0);
  if (sig !== 0x04034b50) return null;
  const method = b.readUInt16LE(8);
  if (method !== 0) return null; // 本实现只产 store 模式
  const crc = b.readUInt32LE(14);
  const csize = b.readUInt32LE(18);
  const usize = b.readUInt32LE(22);
  const nlen = b.readUInt16LE(26);
  const elen = b.readUInt16LE(28);
  const name = b.subarray(30, 30 + nlen).toString('utf8');
  const data = b.subarray(30 + nlen + elen, 30 + nlen + elen + csize);
  const crcOk = (crc32(data) >>> 0) === (crc >>> 0);
  return { name, text: data.toString('utf8'), size: usize, crcOk };
}
