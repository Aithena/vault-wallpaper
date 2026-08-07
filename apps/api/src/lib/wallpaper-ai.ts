import type { Env } from '../../worker-configuration'
import {
  writeAiUsage,
  type AiUsageTrigger,
} from './ai-usage'
import {
  getOriginalObject,
  getPreviewObject,
} from './r2-wallpaper'
import {
  getWallpaper,
  listCategories,
  listTags,
  updateWallpaper,
  type WallpaperRecord,
} from './wallpaper-catalog'

export const WALLPAPER_AI_MODEL = '@cf/moondream/moondream3.1-9B-A2B'
/** Prefer preview; originals larger than this are skipped. */
const MAX_ORIGINAL_BYTES = 2.5 * 1024 * 1024

type AiJsonSuggestion = {
  title?: string
  description?: string
  category?: string
  tags?: string[]
}

export type AnalyzeAiMeta = {
  trigger?: AiUsageTrigger
  adminId?: string
  adminUsername?: string
}

function bytesToDataUri(bytes: ArrayBuffer, contentType: string): string {
  const u8 = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  const b64 = btoa(binary)
  return `data:${contentType || 'image/jpeg'};base64,${b64}`
}

function extractText(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const r = result as Record<string, unknown>
  if (typeof r.response === 'string') return r.response
  if (typeof r.description === 'string') return r.description
  if (typeof r.caption === 'string') return r.caption
  if (typeof r.text === 'string') return r.text
  if (typeof r.answer === 'string') return r.answer
  if (
    Array.isArray(r.output) &&
    r.output[0] &&
    typeof (r.output[0] as { text?: string }).text === 'string'
  ) {
    return (r.output[0] as { text: string }).text
  }
  return JSON.stringify(result)
}

function parseJsonObject(text: string): AiJsonSuggestion | null {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fence?.[1]?.trim() || trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1)) as AiJsonSuggestion
  } catch {
    return null
  }
}

function normalizeName(s: string) {
  return s.trim().toLowerCase()
}

async function loadImageDataUri(
  env: Env,
  id: string,
): Promise<{ dataUri: string; source: 'preview' | 'original' } | { error: string }> {
  if (!env.R2) return { error: 'r2_unavailable' }

  const preview = await getPreviewObject(env.R2, id)
  if (preview) {
    const buf = await preview.arrayBuffer()
    const ct = preview.httpMetadata?.contentType || 'image/jpeg'
    return { dataUri: bytesToDataUri(buf, ct), source: 'preview' }
  }

  const original = await getOriginalObject(env.R2, id)
  if (!original) return { error: 'image_missing' }
  if ((original.size ?? 0) > MAX_ORIGINAL_BYTES) {
    return { error: 'preview_required' }
  }
  const buf = await original.arrayBuffer()
  const ct = original.httpMetadata?.contentType || 'image/jpeg'
  return { dataUri: bytesToDataUri(buf, ct), source: 'original' }
}

async function recordUsage(
  env: Env,
  input: {
    wallpaperId: string
    wallpaperTitle: string
    trigger: AiUsageTrigger
    status: 'success' | 'failed' | 'skipped'
    imageSource: string
    durationMs: number
    error?: string
    adminId?: string
    adminUsername?: string
  },
) {
  try {
    await writeAiUsage(env.KV, {
      ...input,
      model: WALLPAPER_AI_MODEL,
    })
  } catch {
    /* usage logging must not break recognition */
  }
}

export async function markAiPending(
  kv: KVNamespace,
  id: string,
): Promise<WallpaperRecord | null> {
  return updateWallpaper(kv, id, {
    aiStatus: 'pending',
    aiError: '',
  })
}

/**
 * Run Workers AI on wallpaper preview/original.
 * Writes suggestions only — does not overwrite categoryId / tagIds / title.
 * Every attempt is recorded into AI usage stats.
 */
export async function analyzeWallpaperAi(
  env: Env,
  id: string,
  meta: AnalyzeAiMeta = {},
): Promise<{ ok: true; wallpaper: WallpaperRecord } | { ok: false; error: string }> {
  const trigger = meta.trigger ?? 'auto'
  const started = Date.now()

  const wp = await getWallpaper(env.KV, id)
  if (!wp || wp.deletedAt) {
    await recordUsage(env, {
      wallpaperId: id,
      wallpaperTitle: '',
      trigger,
      status: 'failed',
      imageSource: 'none',
      durationMs: Date.now() - started,
      error: 'not_found',
      adminId: meta.adminId,
      adminUsername: meta.adminUsername,
    })
    return { ok: false, error: 'not_found' }
  }

  if (!env.AI) {
    await updateWallpaper(env.KV, id, {
      aiStatus: 'failed',
      aiError: 'ai_unavailable',
      aiAnalyzedAt: new Date().toISOString(),
    })
    await recordUsage(env, {
      wallpaperId: wp.id,
      wallpaperTitle: wp.title,
      trigger,
      status: 'skipped',
      imageSource: 'none',
      durationMs: Date.now() - started,
      error: 'ai_unavailable',
      adminId: meta.adminId,
      adminUsername: meta.adminUsername,
    })
    return { ok: false, error: 'ai_unavailable' }
  }

  const image = await loadImageDataUri(env, id)
  if ('error' in image) {
    await updateWallpaper(env.KV, id, {
      aiStatus: 'failed',
      aiError: image.error,
      aiAnalyzedAt: new Date().toISOString(),
    })
    await recordUsage(env, {
      wallpaperId: wp.id,
      wallpaperTitle: wp.title,
      trigger,
      status: 'failed',
      imageSource: 'none',
      durationMs: Date.now() - started,
      error: image.error,
      adminId: meta.adminId,
      adminUsername: meta.adminUsername,
    })
    return { ok: false, error: image.error }
  }

  const [categories, tags] = await Promise.all([
    listCategories(env.KV),
    listTags(env.KV),
  ])
  const catNames = categories.map((c) => c.name)
  const tagNames = tags.map((t) => t.name)

  const question = [
    'You are classifying a wallpaper image for a wallpaper membership site.',
    'Reply with ONLY a JSON object (no markdown) using this shape:',
    '{"title":"short Chinese title","description":"1-2 Chinese sentences describing the image","category":"one category name","tags":["tag",...]}',
    `Categories (pick exactly one name from this list): ${JSON.stringify(catNames)}`,
    `Tags (pick 0-5 names from this list only): ${JSON.stringify(tagNames)}`,
    'If unsure about category, still pick the closest one. Do not invent category/tag names.',
  ].join('\n')

  try {
    const result = await env.AI.run(WALLPAPER_AI_MODEL, {
      task: 'query',
      image: image.dataUri,
      question,
      reasoning: false,
      stream: false,
      max_tokens: 512,
      temperature: 0.2,
    })

    const text = extractText(result)
    const parsed = parseJsonObject(text)
    if (!parsed) {
      await updateWallpaper(env.KV, id, {
        aiStatus: 'failed',
        aiError: 'parse_failed',
        aiDescription: text.slice(0, 2000),
        aiAnalyzedAt: new Date().toISOString(),
      })
      await recordUsage(env, {
        wallpaperId: wp.id,
        wallpaperTitle: wp.title,
        trigger,
        status: 'failed',
        imageSource: image.source,
        durationMs: Date.now() - started,
        error: 'parse_failed',
        adminId: meta.adminId,
        adminUsername: meta.adminUsername,
      })
      return { ok: false, error: 'parse_failed' }
    }

    const catName = parsed.category ? normalizeName(parsed.category) : ''
    const suggestedCategory =
      categories.find((c) => normalizeName(c.name) === catName) ?? null

    const suggestedTagIds: string[] = []
    for (const name of parsed.tags ?? []) {
      const hit = tags.find((t) => normalizeName(t.name) === normalizeName(name))
      if (hit && !suggestedTagIds.includes(hit.id)) suggestedTagIds.push(hit.id)
    }

    const description = (parsed.description || text).trim().slice(0, 2000)
    const suggestedTitle = (parsed.title || '').trim().slice(0, 80)

    const updated = await updateWallpaper(env.KV, id, {
      aiStatus: 'ready',
      aiDescription: description,
      aiSuggestedTitle: suggestedTitle,
      aiSuggestedCategoryId: suggestedCategory?.id ?? null,
      aiSuggestedTagIds: suggestedTagIds,
      aiError: '',
      aiAnalyzedAt: new Date().toISOString(),
    })

    await recordUsage(env, {
      wallpaperId: wp.id,
      wallpaperTitle: wp.title,
      trigger,
      status: 'success',
      imageSource: image.source,
      durationMs: Date.now() - started,
      adminId: meta.adminId,
      adminUsername: meta.adminUsername,
    })

    if (!updated) return { ok: false, error: 'not_found' }
    return { ok: true, wallpaper: updated }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'ai_error'
    await updateWallpaper(env.KV, id, {
      aiStatus: 'failed',
      aiError: msg,
      aiAnalyzedAt: new Date().toISOString(),
    })
    await recordUsage(env, {
      wallpaperId: wp.id,
      wallpaperTitle: wp.title,
      trigger,
      status: 'failed',
      imageSource: image.source,
      durationMs: Date.now() - started,
      error: msg,
      adminId: meta.adminId,
      adminUsername: meta.adminUsername,
    })
    return { ok: false, error: msg }
  }
}

/** Schedule AI after upload without blocking the response. */
export function scheduleWallpaperAi(
  executionCtx: { waitUntil: (promise: Promise<unknown>) => void },
  env: Env,
  id: string,
  meta: AnalyzeAiMeta = {},
) {
  executionCtx.waitUntil(
    (async () => {
      await markAiPending(env.KV, id)
      await analyzeWallpaperAi(env, id, { ...meta, trigger: meta.trigger ?? 'auto' })
    })(),
  )
}
