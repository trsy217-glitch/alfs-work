// 주간 고객 리포트 → 구글 시트 (Apps Script 웹 앱)
// Vercel 환경 변수:
//   REPORT_SHEET_URL     Apps Script 웹 앱 주소 (docs/weekly-report-sheet.gs 를 배포해서 나온 /exec 주소)
//   REPORT_SHEET_SECRET  아무 긴 문자열. Apps Script 코드의 SECRET 과 똑같이.
// 같은 주를 다시 보내면 시트에서 그 주 줄을 지우고 새로 씁니다 (몇 번 보내도 한 벌만 남음).
import { db, list } from './admin.js'
import { weeklyCustomerReport, weekRange } from '../../shared/report.js'

export const hasSheet = () => Boolean(process.env.REPORT_SHEET_URL && process.env.REPORT_SHEET_SECRET)

/** 그 주 데이터를 Firestore 에서 모아 리포트로 */
export async function buildWeek(mon) {
  const d = db()
  const { startIso, endIso } = weekRange(mon)
  const [leads, members, activity] = await Promise.all([
    d.collection('leads').get().then(list),
    d.collection('members').get().then(list),
    d.collection('activity').where('at', '>=', startIso).where('at', '<', endIso).get().then(list),
  ])
  return weeklyCustomerReport({ leads, members, activity }, mon)
}

/** 시트로 보내기 → { ok, reason } */
export async function sendWeekToSheet(mon, by = '') {
  if (!hasSheet()) return { ok: false, reason: 'REPORT_SHEET_URL · REPORT_SHEET_SECRET 환경 변수가 아직 없어요.' }
  const r = await buildWeek(mon)
  const body = { secret: process.env.REPORT_SHEET_SECRET, by, sentAt: new Date().toISOString(), ...r }
  let res, text = ''
  try {
    res = await fetch(process.env.REPORT_SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
    text = (await res.text()).slice(0, 120)
  } catch (e) { return { ok: false, reason: `구글 시트에 연결하지 못했어요. (${String(e?.message || e).slice(0, 80)})` } }
  if (text === 'ok') return { ok: true, summary: r.summary, rows: r.rows.length }
  if (text === 'no') return { ok: false, reason: 'SECRET 이 서로 달라요. Apps Script 의 SECRET 과 Vercel 의 REPORT_SHEET_SECRET 을 똑같이 맞추고 Redeploy 해 주세요.' }
  if (/<html/i.test(text)) return { ok: false, reason: `웹 앱에 들어가지 못했어요(HTTP ${res.status}). Apps Script 배포의 액세스 권한을 '모든 사용자'로, 주소가 /exec 로 끝나는지 확인해 주세요.` }
  return { ok: false, reason: `시트가 예상과 다른 답을 했어요: ${text}` }
}
