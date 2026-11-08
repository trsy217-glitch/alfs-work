// 주간 고객 리포트 — 앱 '리포트' 화면과 서버(구글 시트 보내기)가 같은 숫자를 씁니다.
// 한 주 = 월요일 00:00 ~ 일요일 24:00 (한국 시간). 기록(activity) 기준으로 셉니다.
import { ROLES, STAGE, CALL_RESULT, CONTRACT, stageLabel } from './constants.js'
import { addDays, dayLabel, kst, weekDays, dowOf } from './time.js'

/** activity 사본 한 줄 — 앱(store.js)과 서버(admin.js)가 같은 모양으로 남깁니다 */
export function activityRow(lead, e) {
  const keep = ['status', 'amount', 'result', 'next', 'nextLabel', 'apptAt', 'place']
  const extra = {}
  for (const k of keep) if (e[k] != null && e[k] !== '') extra[k] = typeof e[k] === 'string' ? e[k].slice(0, 80) : e[k]
  return { leadId: lead.id, leadName: lead.name || '', type: e.type, by: e.by, at: e.at, text: (e.text || '').slice(0, 140), ...extra }
}

export const KIND = { create: '발굴', call: '통화', book: '미팅 예약', meet: '미팅', contract: '계약' }
export const REPORT_TYPES = Object.keys(KIND)

/** 그 날짜가 들어 있는 주의 월요일 */
export const mondayOf = (date) => weekDays(date)[0]

/** ISO 주차 'YYYY-Www' (월요일 기준) */
export function weekKey(mon) {
  const thu = addDays(mon, 3) // ISO 주차는 그 주 목요일이 속한 해
  const y = Number(thu.slice(0, 4))
  const jan4 = `${y}-01-04`
  const firstMon = addDays(jan4, -((dowOf(jan4) + 6) % 7))
  const n = Math.round((Date.parse(`${mon}T00:00:00Z`) - Date.parse(`${firstMon}T00:00:00Z`)) / (7 * 864e5)) + 1
  return `${y}-W${String(n).padStart(2, '0')}`
}

/** 그 주의 시작·끝 (UTC ISO 문자열 — activity.at 과 비교용) */
export function weekRange(mon) {
  const toIso = (d) => new Date(Date.parse(`${d}T00:00:00+09:00`)).toISOString()
  return { startIso: toIso(mon), endIso: toIso(addDays(mon, 7)) }
}

function resultOf(a) {
  if (a.type === 'call') return CALL_RESULT[a.result]?.n || ''
  if (a.type === 'meet') return a.nextLabel || STAGE[a.next]?.n || ''
  if (a.type === 'contract') return CONTRACT[a.status]?.n || ''
  if (a.type === 'book' && a.apptAt) return `${dayLabel(a.apptAt.slice(0, 10))} ${a.apptAt.slice(11, 16)}${a.place ? ` · ${a.place}` : ''}`
  return ''
}

/**
 * 한 주 리포트. data = { leads, members, activity }, mon = 그 주 월요일 'YYYY-MM-DD'
 * → { summary, people, rows }  (rows = 고객 기록 한 줄씩)
 */
export function weeklyCustomerReport({ leads = [], members = [], activity = [] }, mon) {
  const sun = addDays(mon, 6)
  const { startIso, endIso } = weekRange(mon)
  const acts = activity.filter((a) => REPORT_TYPES.includes(a.type) && a.at >= startIso && a.at < endIso).sort((a, b) => a.at.localeCompare(b.at))
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]))
  const nameOf = (id) => members.find((m) => m.id === id)?.name || (id === 'agent' ? 'AI 에이전트' : '')

  const cnt = (list, type, f = () => true) => list.filter((a) => a.type === type && f(a)).length
  const lost = (a) => (a.type === 'contract' && a.status === 'lost') || (a.type === 'meet' && a.next === 'lost')
  const tally = (list) => ({
    scouted: cnt(list, 'create'),
    calls: cnt(list, 'call'),
    talked: cnt(list, 'call', (a) => a.result === 'talked'),
    booked: cnt(list, 'book'),
    met: cnt(list, 'meet'),
    won: cnt(list, 'contract', (a) => a.status === 'won'),
    lost: list.filter(lost).length,
    amount: list.filter((a) => a.type === 'contract' && a.status === 'won').reduce((s, a) => s + (Number(a.amount) || 0), 0),
  })

  const summary = {
    week: weekKey(mon), from: mon, to: sun,
    label: `${dayLabel(mon)} ~ ${dayLabel(sun)}`,
    ...tally(acts),
    customers: new Set(acts.map((a) => a.leadId)).size,
  }
  const people = members.filter((m) => m.role !== 'pending').map((m) => ({
    id: m.id, name: m.name, role: ROLES[m.role]?.short || '',
    ...tally(acts.filter((a) => a.by === m.id)),
  }))
  const rows = acts.map((a) => {
    const l = leadMap[a.leadId] || {}
    const k = kst(new Date(a.at))
    return {
      at: `${k.date} ${k.time}`, day: k.date, type: a.type, kind: KIND[a.type],
      lead: a.leadName || l.name || '', region: l.region || '', category: l.category || '',
      person: nameOf(a.by), result: resultOf(a), amount: a.type === 'contract' && a.amount ? Number(a.amount) : '',
      text: a.text || '', stage: l.stage ? stageLabel(l) : '', leadId: a.leadId || '',
    }
  })
  return { summary, people, rows }
}
