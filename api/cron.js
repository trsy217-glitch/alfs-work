// GET/POST /api/cron — 예약 작업 (Authorization: Bearer CRON_SECRET)
//   · GitHub Actions 가 15분마다 부르고, Vercel 크론이 하루 2번 한 번 더 부릅니다 (빠짐 방지)
// 텔레그램으로 먼저 보내는 것은 하루 2번 브리핑뿐입니다 (대표 결정 2026-11-01). 그 밖의 때에는 물어볼 때만 답합니다.
//   · 아침 브리핑 (기본 08:30)  — 각자 이름으로 오늘 할 일, 대표는 팀 전체 아침 리포트
//   · 저녁 브리핑 (기본 17:00)  — 각자 오늘 한 일·남은 일·내일 일정, 대표는 팀 전체 저녁 리포트
//     (금요일 저녁 리포트에는 주간 리포트, 말일 저녁 리포트에는 정산서를 붙임)
//   · 화·목 09:00 마케팅 초안 — 앱에만 만들어 둠 (알림 없음)
import { adminReady, db, iso, list, getSettings, agentOn, logRun, membersAll } from './_lib/admin.js'
import { hasAI } from './_lib/ai.js'
import { prepFor, weeklyDraft } from './_lib/agents.js'
import { loadBriefData, sendBriefing } from './_lib/brief.js'
import { weeklyReport, monthlySettlement } from '../shared/work.js'
import { OPEN_STAGES } from '../shared/constants.js'
import { kst, addDays, lastDayOfMonth, weekDays } from '../shared/time.js'

const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0) }

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = String(req.headers.authorization || '')
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })
  if (!adminReady()) return res.status(501).json({ error: 'FIREBASE_SERVICE_ACCOUNT 없음' })
  const now = kst(req.query?.at ? new Date(req.query.at) : new Date())
  const out = await runCron(now)
  return res.json(out)
}

export async function runCron(now) {
  const d = db()
  const stateRef = d.collection('system').doc('cron')
  const state = (await stateRef.get()).data() || {}
  const settings = await getSettings()
  const done = []
  const dayOk = settings.briefDays === 'weekdays' ? now.dow >= 1 && now.dow <= 5 : true
  let members = null
  const team = async () => (members ||= (await membersAll()).filter((m) => m.role !== 'pending'))
  const mark = {}
  const am = hm(settings.briefingTime || '08:30'), pm = hm(settings.eveningTime || '17:00')

  // 1) 아침 브리핑 — 정한 시각부터 4시간 안에 한 번 (예약 작업이 늦게 돌아도 빠지지 않게)
  if (dayOk && now.hm >= am && now.hm < am + 240 && state.morningDate !== now.date && agentOn(settings, 'secretary')) {
    mark.morningDate = now.date
    await stateRef.set({ morningDate: now.date }, { merge: true }) // 두 번 보내지 않게 먼저 표시
    // 오늘 미팅인데 준비 메모가 없으면 먼저 만들어 둠 (브리핑에 함께 들어감)
    if (hasAI() && agentOn(settings, 'sales')) {
      const todays = list(await d.collection('leads').where('appt.at', '>=', `${now.date}T00:00`).where('appt.at', '<=', `${now.date}T23:59`).get())
        .filter((l) => OPEN_STAGES.includes(l.stage) && !l.prep?.text).slice(0, 6)
      for (const l of todays) await prepFor(l.id).catch(() => null)
    }
    const r = await sendAll(await team(), 'morning', now)
    await logRun('secretary', `아침 브리핑 ${r.sent.length}명 발송`, r.text, { engine: '규칙', day: now.date })
    done.push(`morning:${r.sent.length}`)
  }

  // 2) 저녁 브리핑 — 정한 시각부터 23시 전까지 한 번
  if (dayOk && now.hm >= pm && now.hm < 23 * 60 && state.eveningDate !== now.date && agentOn(settings, 'secretary')) {
    mark.eveningDate = now.date
    await stateRef.set({ eveningDate: now.date }, { merge: true })
    const extra = []
    if (now.dow === 5) {
      const week = weekDays(now.date)
      const startIso = new Date(Date.parse(`${week[0]}T00:00:00+09:00`)).toISOString()
      const activity = list(await d.collection('activity').where('at', '>=', startIso).get())
      extra.push(weeklyReport(await loadBriefData(now), activity, now))
    }
    if (now.date === lastDayOfMonth(now.date) && agentOn(settings, 'finance')) {
      const month = now.date.slice(0, 7)
      extra.push(monthlySettlement(list(await d.collection('expenses').where('month', '==', month).get()), await team(), month))
    }
    const r = await sendAll(await team(), 'evening', now, extra)
    await logRun('secretary', `저녁 브리핑 ${r.sent.length}명 발송`, r.text, { engine: '규칙', day: now.date })
    for (const x of extra) await logRun(x.title.includes('정산') ? 'finance' : 'secretary', x.title, x.text, { engine: '규칙', day: now.date })
    done.push(`evening:${r.sent.length}`)
  }

  // 3) 화·목 09:00 마케팅 초안 (앱에만, 알림 없음)
  if ((now.dow === 2 || now.dow === 4) && now.hm >= 540 && state.marketingDate !== now.date && agentOn(settings, 'marketing') && hasAI()) {
    mark.marketingDate = now.date
    const n = (state.marketingN || 0)
    try { await weeklyDraft(n); mark.marketingN = n + 1; done.push('marketing') } catch (e) { console.error('draft', e.message) }
  }

  // 오래된 텔레그램 저장 대기 정리 (하루 지난 것)
  if (!state.cleanDate || state.cleanDate !== now.date) {
    const old = await d.collection('tgPending').where('at', '<', new Date(Date.now() - 86400e3).toISOString()).limit(100).get()
    for (const s of old.docs) await s.ref.delete()
    mark.cleanDate = now.date
  }

  await stateRef.set({ ...mark, lastRun: iso(), lastDone: done }, { merge: true })
  return { ok: true, at: now.at, done }
}

/** 팀원 각자에게 (대표는 팀 리포트) — 텔레그램 연결한 사람만 */
async function sendAll(people, kind, now, extra = []) {
  const data = await loadBriefData(now)
  const sent = [], skipped = []
  for (const m of people) {
    if (!m.tgChatId) { skipped.push(m.name); continue }
    try {
      const r = await sendBriefing(m, data, kind, m.role === 'admin' ? extra : [], now)
      if (r?.ok === false) skipped.push(`${m.name}(${r.description || '전송 실패'})`); else sent.push(m.name)
    } catch (e) { skipped.push(`${m.name}(${e.message})`) }
  }
  return { sent, skipped, text: `보냄: ${sent.join(' · ') || '없음'}${skipped.length ? `\n못 보냄: ${skipped.join(' · ')} — 텔레그램 연결 확인` : ''}` }
}

function addMinutes(at, n) {
  const [dd, t] = at.split('T'); const [h, m] = t.split(':').map(Number)
  const total = h * 60 + m + n
  const day = addDays(dd, Math.floor(total / 1440))
  const r = ((total % 1440) + 1440) % 1440
  return `${day}T${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
}
export { addMinutes }
