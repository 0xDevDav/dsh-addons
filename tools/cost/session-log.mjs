// Decompress a multi-frame zstd session log, splitting on frame magic.
import fs from 'node:fs'
import zlib from 'node:zlib'

export function readSession(file) {
  const buf = fs.readFileSync(file)
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
  const starts = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) starts.push(i)
  }
  if (starts.length === 0) starts.push(0)
  const parts = []
  let i = 0
  while (i < starts.length) {
    let end = starts[i + 1] ?? buf.length
    let done = false
    while (!done) {
      try {
        parts.push(zlib.zstdDecompressSync(buf.subarray(starts[i], end)).toString('utf8'))
        done = true
      } catch (e) {
        // Frame boundary guess was wrong (or a partial trailing write): extend.
        if (i + 1 >= starts.length) { done = true; break }
        starts.splice(i + 1, 1)
        end = starts[i + 1] ?? buf.length
      }
    }
    i++
  }
  const text = parts.join('')
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
