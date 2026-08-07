/** R2 object keys for wallpaper assets. */

export function originalKey(id: string) {
  return `originals/${id}.jpg`
}

export function previewKey(id: string) {
  return `previews/${id}.jpg`
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

export async function getPreviewObject(r2: R2Bucket | undefined, id: string) {
  if (!r2) return null
  return r2.get(previewKey(id))
}

export async function getOriginalObject(r2: R2Bucket | undefined, id: string) {
  if (!r2) return null
  return r2.get(originalKey(id))
}

/** Public preview URL path served by API. */
export function previewApiPath(id: string) {
  return `/api/wallpapers/${id}/preview`
}
