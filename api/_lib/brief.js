// 브리핑에 필요한 데이터 읽기 + 한 사람에게 보내기
import { db, list } from './admin.js'
import { send, appUrl, brief } from './tg.js'
import { briefingFor } from '../../shared/work.js'
import { kst, addDays } from '../../shared/time.js'

/** '오늘' 요청 — 한 사람 브리핑 */
export async function sendBriefing(me, data) {
  data ||= await loadBriefData()
  const b = briefingFor(me, data, kst())
  return send(me.tgChatId, brief(b, `<a href="${appUrl('today')}">앱에서 열기</a>`))
}
export async function loadBriefData() {
  const d = db()
  const today = kst().date
  const [leads, events, members, expenses, contents] = await Promise.all([
    d.collection('leads').get().then(list),
    d.collection('events').where('at', '>=', `${addDays(today, -14)}T00:00`).get().then(list),
    d.collection('members').get().then(list),
    d.collection('expenses').where('month', '>=', addDays(today, -40).slice(0, 7)).get().then(list),
    d.collection('contents').where('status', '==', 'review').get().then(list),
  ])
  return { leads, events, members, expenses, contents }
}
