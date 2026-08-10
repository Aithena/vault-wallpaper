/** Resize image so longest edge is at most `maxEdge` (never upscales). */

export type PreviewSize = 100 | 500

export const PREVIEW_SIZES: PreviewSize[] = [100, 500]

export function parsePreviewSize(raw: string | undefined | null): PreviewSize | 'full' {
  if (!raw || raw === 'full') return 'full'
  if (raw === '100' || raw === 'thumb') return 100
  if (raw === '500' || raw === 'medium') return 500
  const n = Number(raw)
  if (n === 100 || n === 500) return n
  return 'full'
}

export async function resizeMaxEdge(
  images: ImagesBinding,
  input: ArrayBuffer | Uint8Array | ReadableStream,
  maxEdge: number,
  quality = 82,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const stream =
    input instanceof ReadableStream
      ? input
      : new Response(
          input instanceof Uint8Array ? input : new Uint8Array(input),
        ).body!

  const result = await images
    .input(stream)
    .transform({
      width: maxEdge,
      height: maxEdge,
      fit: 'scale-down',
    })
    .output({ format: 'image/jpeg', quality })

  const bytes = await new Response(result.image()).arrayBuffer()
  return { bytes, contentType: result.contentType() || 'image/jpeg' }
}
