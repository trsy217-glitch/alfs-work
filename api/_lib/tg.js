// 텔레그램 봇 (알프스 비서) — Bot API 를 직접 부릅니다. 환경 변수 TELEGRAM_BOT_TOKEN
const api = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`
export const hasTelegram = () => Boolean(process.env.TELEGRAM_BOT_TOKEN)
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const appUrl = (hash = 'today') => `${(process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '')}/#${hash}`

async function call(method, body) {
  if (!hasTelegram()) return { ok: false, description: 'no token' }
  try {
    const r = await fetch(api(method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json()
    if (!j.ok) console.error('tg', method, j.description)
    return j
  } catch (e) { console.error('tg', method, e.message); return { ok: false, description: e.message } }
}

/** buttons: [[{text, data}|{text, url}]] */
export function send(chatId, html, buttons) {
  if (!chatId) return Promise.resolve({ ok: false })
  return call('sendMessage', {
    chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } } : {}),
  })
}
export const edit = (chatId, messageId, html) => call('editMessageText', { chat_id: chatId, message_id: messageId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true })
export const answer = (id, text) => call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
export const typing = (chatId) => call('sendChatAction', { chat_id: chatId, action: 'typing' })

/** 파일 내려받기 → { mime, data(base64), size } */
export async function download(fileId) {
  const f = await call('getFile', { file_id: fileId })
  if (!f.ok) throw new Error('getFile 실패')
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`)
  if (!r.ok) throw new Error('파일 내려받기 실패')
  const buf = Buffer.from(await r.arrayBuffer())
  const ext = f.result.file_path.split('.').pop().toLowerCase()
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4' }[ext] || 'application/octet-stream'
  return { mime, data: buf.toString('base64'), size: buf.length }
}

/** 브리핑 같은 {title, sections} 을 텔레그램 글로 */
export function brief(b, footer) {
  return [`<b>${esc(b.title)}</b>`, ...b.sections.map((s) => `\n<b>■ ${esc(s.h)}</b>\n${s.items.map((i) => `· ${esc(i)}`).join('\n')}`), footer ? `\n${footer}` : ''].join('\n').trim()
}
