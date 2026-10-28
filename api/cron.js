// GET/POST /api/cron — GitHub Actions 가 15분마다 부르는 예약 작업 (Authorization: Bearer CRON_SECRET)
// 할 일 (모두 한국 시간, 하루 한 번씩만):
//   · 미팅 1시간 전 알림 + 준비 메모        (매번)
//   · 평일 아침 브리핑 (기본 08:30)         비서
//   · 매일 10:00 재발주 알림                샵관리
//   · 화·목 09:00 마케팅 초안               마케팅
//   · 금 17:00 주간 리포트 (대표)           비서
//   · 매달 말일 18:00 정산서 (대표)          정산
import { adminReady, db, iso, list, getSettings, agentOn, logRun, membersAll } from './_lib/admin.js'
import { hasAI } from './_lib/ai.js'
import { send, brief, appUrl, esc } from './_lib/tg.js'
import { prepFor, weeklyDraft } from './_lib/agents.js'
import { loadBriefData, sendBriefing } from './_lib/brief.js'
import { meetingReminder, weeklyReport, monthlySettlement } from '../shared/work.js'
import { OPEN_STAGES } from '../shared/constants.js'
import { kst, addDays, minutesBetween, lastDayOfMonth, weekDays, daysBetween } from '../shared/time.js'

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
  const weekday = now.dow >= 1 && now.dow <= 5
  let members = null
  const team = async () => (members ||= (await membersAll()).filter((m) => m.role !== 'pending'))
  const mark = {}

  // 1) 미팅 1시간 전 알림 (영업지원)
  if (agentOn(settings, 'sales')) {
    const soon = list(await d.collection('leads').where('appt.at', '>', now.at).where('appt.at', '<=', addMinutes(now.at, 75)).get())
    for (const l of soon) {
      if (!OPEN_STAGES.includes(l.stage) || l.appt.reminded) continue
      let lead = l
      if (!l.prep?.text && hasAI()) lead = await prepFor(l.id).catch(() => l)
      const to = (await team()).find((m) => m.id === l.salesId)
      if (to?.tgChatId) await send(to.tgChatId, brief(meetingReminder(lead, now), `<a href="${appUrl('leads')}">고객 카드 열기</a>`))
      await d.collection('leads').doc(l.id).update({ 'appt.reminded': true })
      await logRun('sales', `미팅 1시간 전 알림 · ${l.name}`, `${to?.name || '영업 미정'} · ${minutesBetween(now.at, l.appt.at)}분 전`, { leadId: l.id })
      done.push(`reminder:${l.name}`)
    }
  }

  // 2) 평일 아침 브리핑 (비서)
  if (weekday && now.hm >= hm(settings.briefingTime || '08:30') && state.briefDate !== now.date && agentOn(settings, 'secretary')) {
    const data = await loadBriefData()
    const people = (await team()).filter((m) => m.tgChatId)
    for (const m of people) await sendBriefing(m, data)
    mark.briefDate = now.date
    await logRun('secretary', `아침 브리핑 ${people.length}명 발송`, people.map((m) => m.name).join(' · ') || '텔레그램 연결한 팀원이 없어요', { engine: '규칙', day: now.date })
    done.push('briefing')
  }

  // 3) 매일 10:00 재발주 알림 (샵관리)
  if (now.hm >= 600 && state.reorderDate !== now.date && agentOn(settings, 'shop')) {
    const due = list(await d.collection('leads').where('partner.nextReorder', '<=', addDays(now.date, 3)).get())
      .filter((l) => l.stage === 'won' && l.partner?.notifiedFor !== l.partner.nextReorder)
    const byOwner = {}
    for (const l of due) (byOwner[l.managerId || 'none'] ||= []).push(l)
    const people = await team()
    const admins = people.filter((m) => m.role === 'admin')
    for (const [owner, shops] of Object.entries(byOwner)) {
      const to = people.find((m) => m.id === owner) || admins[0]
      const lines = shops.map((l) => { const n = daysBetween(now.date, l.partner.nextReorder); return `· ${esc(l.name)} — ${n < 0 ? `${-n}일 지남` : n === 0 ? '오늘' : `D-${n}`} (주문 ${l.orders || 0}회)` })
      if (to?.tgChatId) await send(to.tgChatId, `<b>재발주 때가 된 파트너샵 ${shops.length}곳</b>\n${lines.join('\n')}\n\n연락은 담당자가 판단해서 해 주세요.`, [[{ text: '파트너샵 화면', url: appUrl('partners') }]])
      for (const l of shops) await d.collection('leads').doc(l.id).update({ 'partner.notifiedFor': l.partner.nextReorder })
    }
    mark.reorderDate = now.date
    if (due.length) await logRun('shop', `재발주 알림 ${due.length}곳`, due.map((l) => l.name).join(' · '), { engine: '규칙', day: now.date })
    done.push(`reorder:${due.length}`)
  }

  // 4) 화·목 09:00 마케팅 초안
  if ((now.dow === 2 || now.dow === 4) && now.hm >= 540 && state.marketingDate !== now.date && agentOn(settings, 'marketing') && hasAI()) {
    mark.marketingDate = now.date
    const n = (state.marketingN || 0)
    try { await weeklyDraft(n); mark.marketingN = n + 1; done.push('marketing') } catch (e) { console.error('draft', e.message) }
  }

  // 5) 금 17:00 주간 리포트 (대표)
  if (now.dow === 5 && now.hm >= 1020 && state.weeklyDate !== now.date && agentOn(settings, 'secretary')) {
    const week = weekDays(now.date)
    const startIso = new Date(Date.parse(`${week[0]}T00:00:00+09:00`)).toISOString()
    const activity = list(await d.collection('activity').where('at', '>=', startIso).get())
    const data = await loadBriefData()
    const r = weeklyReport(data, activity, now)
    for (const a of (await team()).filter((m) => m.role === 'admin' && m.tgChatId)) await send(a.tgChatId, brief(r, `<a href="${appUrl('dashboard')}">대시보드 열기</a>`))
    mark.weeklyDate = now.date
    await logRun('secretary', r.title, r.text, { engine: '규칙', day: now.date })
    done.push('weekly')
  }

  // 6) 매달 말일 18:00 정산서 (대표)
  if (now.date === lastDayOfMonth(now.date) && now.hm >= 1080 && state.monthlyDate !== now.date && agentOn(settings, 'finance')) {
    const month = now.date.slice(0, 7)
    const exps = list(await d.collection('expenses').where('month', '==', month).get())
    const r = monthlySettlement(exps, await team(), month)
    for (const a of (await team()).filter((m) => m.role === 'admin' && m.tgChatId)) await send(a.tgChatId, brief(r, `<a href="${appUrl('expenses')}">정산표 내려받기 (앱 → 비용 → 전체)</a>`))
    mark.monthlyDate = now.date
    await logRun('finance', r.title, r.text, { engine: '규칙', day: now.date })
    done.push('monthly')
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

function addMinutes(at, n) {
  const [dd, t] = at.split('T'); const [h, m] = t.split(':').map(Number)
  const total = h * 60 + m + n
  const day = addDays(dd, Math.floor(total / 1440))
  const r = ((total % 1440) + 1440) % 1440
  return `${day}T${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
}
export { addMinutes }
