// One-off utility: downscale PNGs under 768 KB so they can be attached for visual review.
// Usage: node scripts/downscale-png.mjs <in.png> <out.png> [targetWidth]
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png')
  let off = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  const plte = []
  const trns = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') {
      for (let i = 0; i < data.length; i += 3) plte.push([data[i], data[i + 1], data[i + 2]])
    } else if (type === 'tRNS') {
      for (let i = 0; i < data.length; i++) trns.push(data[i])
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth)
  if (interlace) throw new Error('interlaced png not supported')
  const channelsMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const channels = channelsMap[colorType]
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 4)
  const prev = Buffer.alloc(stride)
  const cur = Buffer.alloc(stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    for (let i = 0; i < stride; i++) cur[i] = raw[p + i]
    p += stride
    // unfilter
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = cur[i]
      if (filter === 1) v = (v + a) & 0xff
      else if (filter === 2) v = (v + b) & 0xff
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        v = (v + pred) & 0xff
      }
      cur[i] = v
    }
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 255
      if (colorType === 2) {
        r = cur[x * 3]
        g = cur[x * 3 + 1]
        b = cur[x * 3 + 2]
      } else if (colorType === 6) {
        r = cur[x * 4]
        g = cur[x * 4 + 1]
        b = cur[x * 4 + 2]
        a = cur[x * 4 + 3]
      } else if (colorType === 0) {
        r = g = b = cur[x]
      } else if (colorType === 4) {
        r = g = b = cur[x * 2]
        a = cur[x * 2 + 1]
      } else if (colorType === 3) {
        const idx = cur[x]
        const pal = plte[idx] || [0, 0, 0]
        r = pal[0]
        g = pal[1]
        b = pal[2]
        if (trns.length > idx) a = trns[idx]
      }
      const o = (y * width + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
    prev.set(cur)
  }
  return { width, height, data: out }
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function bilinear(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(((y + 0.5) * sh) / dh - 0.5, sh - 1)
    const y0 = Math.max(0, Math.floor(fy))
    const y1 = Math.min(sh - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(((x + 0.5) * sw) / dw - 0.5, sw - 1)
      const x0 = Math.max(0, Math.floor(fx))
      const x1 = Math.min(sw - 1, x0 + 1)
      const wx = fx - x0
      for (let ch = 0; ch < 4; ch++) {
        const s00 = src[(y0 * sw + x0) * 4 + ch]
        const s01 = src[(y0 * sw + x1) * 4 + ch]
        const s10 = src[(y1 * sw + x0) * 4 + ch]
        const s11 = src[(y1 * sw + x1) * 4 + ch]
        const top = s00 + (s01 - s00) * wx
        const bot = s10 + (s11 - s10) * wx
        out[(y * dw + x) * 4 + ch] = Math.round(top + (bot - top) * wy)
      }
    }
  }
  return out
}

const [, , inPath, outPath, targetWidthArg] = process.argv
const targetWidth = parseInt(targetWidthArg || '640', 10)
const buf = readFileSync(inPath)
const { width, height, data } = decodePng(buf)
const scale = Math.min(1, targetWidth / width)
const dw = Math.max(1, Math.round(width * scale))
const dh = Math.max(1, Math.round(height * scale))
const outData = scale < 1 ? bilinear(data, width, height, dw, dh) : data
const png = encodePng(dw, dh, outData)
writeFileSync(outPath, png)
console.log(`${inPath} ${width}x${height} -> ${outPath} ${dw}x${dh} (${(png.length / 1024).toFixed(0)} KB)`)
