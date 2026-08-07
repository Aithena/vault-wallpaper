/** Opaque wallpaper id: 16-char alphanumeric (no underscore / hyphen). */

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SIZE = 16
const RE = /^[0-9A-Za-z]{16}$/

function nanoid(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let id = ''
  // rejection sampling keeps distribution uniform over 62-char alphabet
  let i = 0
  while (id.length < size) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes)
      i = 0
    }
    const b = bytes[i++]!
    if (b >= 248) continue // 248 = 62 * 4
    id += ALPHABET[b % 62]!
  }
  return id
}

export function newWallpaperId(): string {
  return nanoid(SIZE)
}

export function isNanoidWallpaperId(id: string): boolean {
  return RE.test(id)
}
