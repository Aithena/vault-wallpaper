import {
  PREVIEW_SIZES,
  resizeMaxEdge,
  type PreviewSize,
} from './image-resize'

/** R2 object keys for wallpaper assets. */

export function originalKey(id: string) {
  return `originals/${id}.jpg`
}

export function previewKey(id: string) {
  return `previews/${id}.jpg`
}

export function previewSizeKey(id: string, size: PreviewSize) {
  return `previews/${id}-w${size}.jpg`
}

export async function headOriginal(
  r2: R2Bucket | undefined,
  id: string,
): Promise<boolean> {
  if (!r2) return false
  const obj = await r2.head(originalKey(id))
  return Boolean(obj)
}

export async function putOriginal(
  r2: R2Bucket,
  id: string,
  body: ReadableStream | ArrayBuffer | Blob,
  contentType?: string,
): Promise<void> {
  await r2.put(originalKey(id), body, {
    httpMetadata: {
      contentType: contentType || 'image/jpeg',
    },
  })
}

export async function putPreview(
  r2: R2Bucket,
  id: string,
  body: ReadableStream | ArrayBuffer | Blob,
  contentType?: string,
): Promise<void> {
  await r2.put(previewKey(id), body, {
    httpMetadata: {
      contentType: contentType || 'image/jpeg',
    },
  })
}

/** Save full preview + longest-edge 100 / 500 thumbs. */
export async function putPreviewWithVariants(
  r2: R2Bucket,
  images: ImagesBinding | undefined,
  id: string,
  body: ArrayBuffer,
  contentType?: string,
): Promise<{ thumbsOk: boolean }> {
  await putPreview(r2, id, body, contentType)
  if (!images) return { thumbsOk: false }

  try {
    await Promise.all(
      PREVIEW_SIZES.map(async (size) => {
        const { bytes, contentType: ct } = await resizeMaxEdge(images, body, size)
        await r2.put(previewSizeKey(id, size), bytes, {
          httpMetadata: { contentType: ct || 'image/jpeg' },
        })
      }),
    )
    return { thumbsOk: true }
  } catch (err) {
    console.error('preview thumb generate failed', id, err)
    return { thumbsOk: false }
  }
}

export async function getPreviewObject(r2: R2Bucket | undefined, id: string) {
  if (!r2) return null
  return r2.get(previewKey(id))
}

export async function getPreviewSizeObject(
  r2: R2Bucket | undefined,
  id: string,
  size: PreviewSize,
) {
  if (!r2) return null
  return r2.get(previewSizeKey(id, size))
}

/**
 * Resolve preview variant; optionally generate+cache missing thumbs via Images.
 */
export async function resolvePreviewObject(
  r2: R2Bucket | undefined,
  images: ImagesBinding | undefined,
  id: string,
  size: PreviewSize | 'full',
  opts?: { cacheMissing?: boolean },
): Promise<R2ObjectBody | null> {
  if (!r2) return null
  if (size === 'full') return getPreviewObject(r2, id)

  const existing = await getPreviewSizeObject(r2, id, size)
  if (existing) return existing

  const full = await getPreviewObject(r2, id)
  if (!full) return null
  if (!images || !opts?.cacheMissing) return full

  try {
    const src = await full.arrayBuffer()
    const { bytes, contentType } = await resizeMaxEdge(images, src, size)
    await r2.put(previewSizeKey(id, size), bytes, {
      httpMetadata: { contentType: contentType || 'image/jpeg' },
    })
    return r2.get(previewSizeKey(id, size))
  } catch (err) {
    console.error('preview thumb backfill failed', id, size, err)
    // Re-fetch full — previous body consumed
    return getPreviewObject(r2, id)
  }
}

export async function getOriginalObject(r2: R2Bucket | undefined, id: string) {
  if (!r2) return null
  return r2.get(originalKey(id))
}

/** Delete original + preview + thumb objects from R2 (missing keys are ignored). */
export async function deleteWallpaperObjects(
  r2: R2Bucket | undefined,
  id: string,
): Promise<void> {
  if (!r2) return
  await Promise.all([
    r2.delete(originalKey(id)),
    r2.delete(previewKey(id)),
    ...PREVIEW_SIZES.map((size) => r2.delete(previewSizeKey(id, size))),
  ])
}

/** Public API origin for absolute asset URLs (admin/web are on other hosts). */
export const API_PUBLIC_ORIGIN = 'https://api.awall.cc'

/** Public preview URL path served by API (relative). */
export function previewApiPath(id: string, size: PreviewSize | 'full' = 'full') {
  if (size === 'full') return `/api/wallpapers/${id}/preview`
  return `/api/wallpapers/${id}/preview?size=${size}`
}

/** Turn relative `/api/...` preview paths into absolute URLs for `<img src>`. */
export function absolutizeAssetUrl(
  url: string,
  origin: string = API_PUBLIC_ORIGIN,
): string {
  if (!url) return url
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  const base = origin.replace(/\/$/, '')
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}

/** Absolute list/card URLs derived from wallpaper id (R2 variants). */
export function wallpaperImageUrls(id: string) {
  return {
    previewUrl: absolutizeAssetUrl(previewApiPath(id, 'full')),
    thumbUrl: absolutizeAssetUrl(previewApiPath(id, 100)),
    mediumUrl: absolutizeAssetUrl(previewApiPath(id, 500)),
  }
}
