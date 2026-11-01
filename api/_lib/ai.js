// AI 엔진 — Claude Haiku 와 Gemini Flash-Lite (대표 결정 2026-10-28)
// 일마다 먼저 쓸 엔진을 정하고, 실패하거나 키가 없으면 다른 엔진으로 넘어갑니다.
//   영수증 읽기·고객 메모 정리·미팅 준비 → Claude Haiku 먼저
//   음성 메모 받아쓰기 → Gemini (Claude 는 음성을 받지 않음)
//   마케팅 초안 (고객 정보 없음) → Gemini Flash-Lite 먼저
const CLAUDE_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY)
export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY)
export const hasAI = () => hasClaude() || hasGemini()

const ORDER = { receipt: ['claude', 'gemini'], memo: ['claude', 'gemini'], prep: ['claude', 'gemini'], voice: ['gemini'], draft: ['gemini', 'claude'], video: ['gemini'], yt: ['claude', 'gemini'] }

/**
 * @param task  receipt | memo | prep | voice | draft
 * @param p     { system, text, image?: {mime, data(base64)}, audio?: {mime, data}, video?: 유튜브 주소, maxTokens, json, temperature }
 * @returns     { text, engine } — 엔진이 하나도 안 되면 throw
 */
export async function ask(task, p) {
  const tried = []
  for (const eng of ORDER[task] || ['claude', 'gemini']) {
    if (eng === 'claude' && (!hasClaude() || p.audio || p.video)) continue
    if (eng === 'gemini' && !hasGemini()) continue
    try {
      const text = eng === 'claude' ? await claude(p) : await gemini(p)
      if (text) return { text, engine: eng === 'claude' ? 'Claude Haiku' : p.video ? `Gemini (${VIDEO_MODEL()})` : 'Gemini Flash-Lite' }
    } catch (e) { tried.push(`${eng}: ${e.message}`); console.error('ai', task, eng, e.message) }
  }
  throw Object.assign(new Error(tried.length ? tried.join(' / ') : '연결된 AI 엔진이 없습니다'), { code: 'no-ai' })
}

async function claude({ system, text, image, maxTokens = 800, temperature }) {
  const content = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } })
  content.push({ type: 'text', text })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: maxTokens, ...(temperature != null ? { temperature } : {}), ...(system ? { system } : {}), messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim()
}

// 유튜브 영상을 직접 보는 분석은 Flash 계열 (Flash-Lite 보다 영상 이해가 낫고, 실패하면 Flash-Lite 로)
const VIDEO_MODEL = () => process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash'

async function gemini({ system, text, image, audio, video, maxTokens = 800, json, temperature = 0.4 }) {
  if (video) {
    try { return await geminiCall(VIDEO_MODEL(), { system, text, video, maxTokens, json, temperature }) } catch (e) {
      if (VIDEO_MODEL() === GEMINI_MODEL()) throw e
      console.error('ai video model', e.message)
    }
  }
  return geminiCall(GEMINI_MODEL(), { system, text, image, audio, video, maxTokens, json, temperature })
}

async function geminiCall(model, { system, text, image, audio, video, maxTokens, json, temperature }) {
  const parts = []
  // 유튜브 공개 영상은 주소만 넘기면 Gemini 가 직접 봅니다. 길면 앞 12분만, 저해상도로 (응답 시간·비용)
  if (video) parts.push({ fileData: { fileUri: video }, videoMetadata: { startOffset: '0s', endOffset: '720s' } })
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } })
  if (audio) parts.push({ inline_data: { mime_type: audio.mime, data: audio.data } })
  parts.push({ text })
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}), ...(video ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) },
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim()
}

/** 답에서 JSON 하나 꺼내기 */
export function pickJson(s) {
  const t = String(s || '').replace(/```(?:json)?/g, '')
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b < a) return null
  try { return JSON.parse(t.slice(a, b + 1)) } catch { return null }
}
