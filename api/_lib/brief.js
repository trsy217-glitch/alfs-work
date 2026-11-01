// 브리핑 — 하루 2번(아침·저녁) 각자 이름으로, 대표에게는 팀 전체 리포트
import { db, list } from './admin.js'
import { send, appUrl, brief } from './tg.js'
import { briefingFor, eveningFor, teamReport } from '../../shared/work.js'
import { kst, addDays } from '../../shared/time.js'

/** 한 사람에게 보낼 브리핑 만들기. kind = morning | evening */
export function reportFor(me, data, kind = 'morning', now = kst()) {
  if (me.role === 'admin') return teamReport(data, data.activityToday || [], now, kind)
  return kind === 'evening' ? eveningFor(me, data, data.activityToday || [], now) : briefingFor(me, data, now)
}

/** 보내기 (예약 작업 또는 텔레그램에서 '오늘'·'저녁'·'리포트' 요청) */
export async function sendBriefing(me, data, kind = 'morning', extra = [], now = kst()) {
  data ||= await loadBriefData(now)
  const b = reportFor(me, data, kind, now)
  for (const x of extra) if (x) { b.sections.push({ h: `── ${x.title} ──`, items: [] }, ...x.sections); b.text += `\n\n${x.text}` }
  return send(me.tgChatId, brief(b, `<a href="${appUrl(me.role === 'admin' ? 'dashboard' : 'today')}">앱에서 열기</a>`))
}

export async function loadBriefData(now = kst()) {
  const d = db()
  const today = now.date
  const startIso = new Date(Date.parse(`${today}T00:00:00+09:00`)).toISOString()
  const [leads, events, members, expenses, contents, activityToday] = await Promise.all([
    d.collection('leads').get().then(list),
    d.collection('events').where('at', '>=', `${addDays(today, -14)}T00:00`).get().then(list),
    d.collection('members').get().then(list),
    d.collection('expenses').where('month', '>=', addDays(today, -40).slice(0, 7)).get().then(list),
    d.collection('contents').where('status', '==', 'review').get().then(list),
    d.collection('activity').where('at', '>=', startIso).get().then(list),
  ])
  return { leads, events, members, expenses, contents, activityToday }
}
