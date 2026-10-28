// 날짜·시간 — 모든 일정은 한국 시간 'YYYY-MM-DDTHH:MM' 문자열로 저장합니다.
// 서버(Vercel)는 UTC로 돌기 때문에 kst()로 한국 시간을 구합니다.
const pad = (n) => String(n).padStart(2, '0')
const WD = ['일', '월', '화', '수', '목', '금', '토']

/** 한국 시간 기준 지금 */
export function kst(d = new Date()) {
  const t = new Date(d.getTime() + 9 * 3600e3)
  const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
  const time = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
  return { date, time, at: `${date}T${time}`, dow: t.getUTCDay(), hm: t.getUTCHours() * 60 + t.getUTCMinutes() }
}
export const todayStr = () => kst().date
export const nowLocal = () => kst().at

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
export const dowOf = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
export function weekDays(date = todayStr()) {
  const mon = addDays(date, -((dowOf(date) + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}
export const dayLabel = (d) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))} (${WD[dowOf(d)]})`
export function daysBetween(a, b) {
  const p = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 864e5)
}
/** 'YYYY-MM-DDTHH:MM' 두 개 사이 분 */
export function minutesBetween(a, b) {
  const p = (s) => { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, h, mi) }
  return Math.round((p(b) - p(a)) / 6e4)
}
export function fmtWhen(s, today = todayStr()) {
  if (!s) return ''
  const [d, t] = s.split('T')
  const diff = daysBetween(today, d)
  const day = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === -1 ? '어제' : `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}(${WD[dowOf(d)]})`
  return t ? `${day} ${t.slice(0, 5)}` : day
}
export function fmtAgo(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso)) / 6e4)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  return d < 7 ? `${d}일 전` : iso.slice(5, 10).replace('-', '.')
}
export const lastDayOfMonth = (date) => { const [y, m] = date.split('-').map(Number); return addDays(`${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01`, -1) }
export const shiftMonth = (mo, d) => { const [y, m] = mo.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}` }
export const won = (n) => (Math.round(n) || 0).toLocaleString('ko-KR')
export const telHref = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`
export function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9 && d.startsWith('02')) return `02-${d.slice(2, 5)}-${d.slice(5)}`
  return p || ''
}
export const checkKey = (type, at) => `${type}_${String(at).replace(/[^0-9A-Za-z]/g, '')}`
