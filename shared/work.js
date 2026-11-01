// 할 일·브리핑·리포트 만들기 — 앱 '오늘' 화면과 텔레그램 알림이 같은 결과를 냅니다.
import { OPEN_STAGES, TASK, ROLES, EXP_CAT, stageLabel, DEFAULT_REORDER_DAYS, salesOf } from './constants.js'
import { addDays, checkKey, daysBetween, dayLabel, fmtWhen, kst, minutesBetween, weekDays, won } from './time.js'

/** 고객 카드와 따로 넣은 일정에서 할 일 목록을 만듭니다 */
export function buildTasks(leads = [], events = []) {
  const out = []
  for (const l of leads) {
    const add = (type, at, extra = {}) => {
      if (!at) return
      const key = checkKey(type, at)
      out.push({ id: `${l.id}:${key}`, key, type, at, day: at.slice(0, 10), lead: l, ownerId: l[TASK[type].duty] || null, done: l.checks?.[key] || null, title: l.name, ...extra })
    }
    if (OPEN_STAGES.includes(l.stage) && l.nextCall) add('call', l.nextCall)
    if (OPEN_STAGES.includes(l.stage) && l.appt?.at) add('meet', l.appt.at, { place: l.appt.place, coIds: salesOf(l) })
    if (l.nextManage) add('manage', l.nextManage)
    if (l.stage === 'won' && l.partner?.nextReorder) add('reorder', `${l.partner.nextReorder}T10:00`)
  }
  for (const e of events) {
    if (!e.at) continue
    out.push({ id: `ev:${e.id}`, key: e.id, type: 'event', at: e.at, day: e.at.slice(0, 10), event: e, lead: null, ownerId: e.who && e.who !== 'all' ? e.who : null, forAll: !e.who || e.who === 'all', done: e.done || null, title: e.title, place: e.place })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

export const isMine = (t, uid) => t.ownerId === uid || t.forAll || !!t.coIds?.includes(uid)

/** 다음 재발주 예상일 */
export function nextReorder(partner = {}) {
  const base = partner.lastOrderAt || partner.since
  if (!base) return null
  return addDays(base.slice(0, 10), Number(partner.cycleDays) || DEFAULT_REORDER_DAYS)
}

/** 아침 브리핑 (한 사람용). data = { leads, events, expenses, contents, members } */
export function briefingFor(member, data, now = kst()) {
  const today = now.date
  const uid = member.id
  const tasks = buildTasks(data.leads, data.events)
  const mine = tasks.filter((t) => isMine(t, uid))
  const todayList = mine.filter((t) => t.day === today && !t.done)
  const late = mine.filter((t) => t.day < today && !t.done)
  const sections = []
  const line = (t) => `${t.at.slice(11, 16)} ${TASK[t.type].n} · ${t.title}${t.place ? ` (${t.place})` : ''}`
  sections.push({ h: `오늘 할 일 ${todayList.length}건`, items: todayList.length ? todayList.map(line) : ['오늘 잡힌 일정이 없어요.'] })
  if (late.length) sections.push({ h: `밀린 일 ${late.length}건`, items: late.slice(0, 8).map((t) => `${dayLabel(t.day)} ${TASK[t.type].n} · ${t.title}`) })

  const toAck = (data.leads || []).filter((l) => OPEN_STAGES.includes(l.stage) && l.appt && !l.apptAck && salesOf(l).includes(uid))
  if (toAck.length) sections.push({ h: '확인할 미팅 예약', items: toAck.map((l) => `${fmtWhen(l.appt.at, today)} · ${l.name}`) })

  const preps = (data.leads || []).filter((l) => l.appt?.at?.startsWith(today) && salesOf(l).includes(uid) && l.prep?.text)
  // 미팅 1시간 전 알림 대신, 오늘 미팅의 준비 메모를 아침 브리핑에 자세히
  for (const l of preps) sections.push({ h: `${l.appt.at.slice(11, 16)} 미팅 준비 · ${l.name}${l.appt.place ? ` (${l.appt.place})` : ''}`, items: l.prep.text.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 9) })

  if (member.role === 'admin') {
    const waitExp = (data.expenses || []).filter((e) => e.status === 'pending')
    const waitCt = (data.contents || []).filter((c) => c.status === 'review')
    const items = []
    if (waitExp.length) items.push(`비용 ${waitExp.length}건 · ${won(waitExp.reduce((n, e) => n + e.amount, 0))}원`)
    if (waitCt.length) items.push(`마케팅 글 ${waitCt.length}건`)
    if (items.length) sections.push({ h: '승인 대기', items })
    const teamMeet = tasks.filter((t) => t.day === today && t.type === 'meet')
    sections.push({ h: `팀 오늘 미팅 ${teamMeet.length}건`, items: teamMeet.length ? teamMeet.map((t) => `${t.at.slice(11, 16)} ${t.title} · ${nameOf(data.members, t.ownerId)}`) : ['오늘 팀 미팅이 없어요.'] })
    const month = today.slice(0, 7)
    const won_ = (data.leads || []).filter((l) => l.contract?.status === 'won' && (l.contract.date || '').startsWith(month))
    const spent = (data.expenses || []).filter((e) => e.month === month && e.status !== 'rejected')
    sections.push({ h: '이번 달', items: [`계약 ${won_.length}건`, `비용 ${won(spent.reduce((n, e) => n + e.amount, 0))}원`] })
  }
  if (member.role === 'manager' || member.role === 'admin') {
    const soon = (data.leads || []).filter((l) => l.stage === 'won' && l.partner?.nextReorder && daysBetween(today, l.partner.nextReorder) <= 3 && (member.role === 'admin' || l.managerId === uid))
    if (soon.length) sections.push({ h: '재발주 때가 된 샵', items: soon.map((l) => `${l.name} · ${dDay(today, l.partner.nextReorder)}`) })
  }
  const title = `${member.name}님, ${dayLabel(today)} 브리핑`
  return { title, sections, text: toText(title, sections) }
}

const ACT_N = { call: '통화', book: '미팅 예약', meet: '미팅', contract: '계약', manage: '샵 관리', order: '주문', note: '메모', tg: '텔레그램 메모', ack: '예약 확인', check: '완료 체크', create: '고객 등록' }
function doneToday(activity = [], uid) {
  const mine = activity.filter((a) => a.by === uid)
  const c = {}; mine.forEach((a) => { c[a.type] = (c[a.type] || 0) + 1 })
  return { mine, summary: Object.entries(c).map(([k, n]) => `${ACT_N[k] || k} ${n}`).join(' · ') || '기록 없음' }
}

/** 저녁 정리 (한 사람용) — 오늘 한 일 · 아직 남은 일 · 내일 일정. activity = 오늘 기록 */
export function eveningFor(member, data, activity = [], now = kst()) {
  const today = now.date, tomorrow = addDays(today, 1), uid = member.id
  const tasks = buildTasks(data.leads, data.events).filter((t) => isMine(t, uid))
  const left = tasks.filter((t) => t.day <= today && !t.done)
  const tmr = tasks.filter((t) => t.day === tomorrow)
  const d = doneToday(activity, uid)
  const line = (t) => `${t.day < today ? `${dayLabel(t.day)} ` : ''}${t.at.slice(11, 16)} ${TASK[t.type].n} · ${t.title}${t.place ? ` (${t.place})` : ''}`
  const sections = [
    { h: `오늘 한 일 · ${d.summary}`, items: d.mine.length ? d.mine.slice(0, 10).map((a) => `${ACT_N[a.type] || a.type} · ${a.leadName || ''}${a.text ? ` — ${String(a.text).slice(0, 40)}` : ''}`) : ['오늘 남긴 기록이 없어요. 통화·미팅을 했다면 앱이나 여기로 메모를 보내 주세요.'] },
    { h: `아직 남은 일 ${left.length}건`, items: left.length ? left.slice(0, 8).map(line) : ['남은 일 없음. 수고하셨어요!'] },
    { h: `내일 일정 ${tmr.length}건`, items: tmr.length ? tmr.map(line) : ['내일 잡힌 일정이 없어요.'] },
  ]
  const toAck = (data.leads || []).filter((l) => OPEN_STAGES.includes(l.stage) && l.appt && !l.apptAck && salesOf(l).includes(uid))
  if (toAck.length) sections.push({ h: '확인할 미팅 예약', items: toAck.map((l) => `${fmtWhen(l.appt.at, today)} · ${l.name}`) })
  const title = `${member.name}님, ${dayLabel(today)} 저녁 정리`
  return { title, sections, text: toText(title, sections) }
}

/** 대표 리포트 — 팀원 전체 현황 (아침: 오늘 계획 / 저녁: 오늘 결과) */
export function teamReport(data, activity = [], now = kst(), kind = 'morning') {
  const today = now.date, tomorrow = addDays(today, 1)
  const people = (data.members || []).filter((m) => m.role !== 'pending')
  const tasks = buildTasks(data.leads, data.events)
  const sections = []
  const line = (t) => `${t.at.slice(11, 16)} ${TASK[t.type].n} · ${t.title}`
  for (const m of people) {
    const mine = tasks.filter((t) => isMine(t, m.id) && !t.forAll)
    const todayList = mine.filter((t) => t.day === today && !t.done)
    const late = mine.filter((t) => t.day < today && !t.done)
    const head = `${m.name}${m.title ? ` ${m.title}` : ` (${ROLES[m.role]?.short || ''})`}`
    if (kind === 'morning') {
      sections.push({ h: `${head} · 오늘 ${todayList.length}건${late.length ? ` · 밀린 일 ${late.length}` : ''}`, items: todayList.length ? todayList.slice(0, 6).map(line) : ['오늘 잡힌 일정 없음'] })
    } else {
      const d = doneToday(activity, m.id)
      const tmr = mine.filter((t) => t.day === tomorrow)
      sections.push({ h: `${head} · ${d.summary}`, items: [
        ...(d.mine.slice(0, 4).map((a) => `${ACT_N[a.type] || a.type} · ${a.leadName || ''}${a.text ? ` — ${String(a.text).slice(0, 30)}` : ''}`)),
        `남은 일 ${todayList.length + late.length}건 · 내일 ${tmr.length}건`,
      ] })
    }
  }
  const items = []
  const waitExp = (data.expenses || []).filter((e) => e.status === 'pending')
  const waitCt = (data.contents || []).filter((c) => c.status === 'review')
  if (waitExp.length) items.push(`비용 ${waitExp.length}건 · ${won(waitExp.reduce((n, e) => n + e.amount, 0))}원`)
  if (waitCt.length) items.push(`마케팅 글 ${waitCt.length}건`)
  if (items.length) sections.push({ h: '승인 대기 (앱 → 정산 · 마케팅)', items })
  const toAck = (data.leads || []).filter((l) => OPEN_STAGES.includes(l.stage) && l.appt && !l.apptAck)
  if (toAck.length) sections.push({ h: `영업이 아직 확인 안 한 미팅 ${toAck.length}건`, items: toAck.slice(0, 6).map((l) => `${fmtWhen(l.appt.at, today)} · ${l.name} · ${salesOf(l).map((id) => nameOf(data.members, id)).join('·') || '영업 미정'}`) })
  const soon = (data.leads || []).filter((l) => l.stage === 'won' && l.partner?.nextReorder && daysBetween(today, l.partner.nextReorder) <= 3)
  if (soon.length) sections.push({ h: '재발주 때가 된 샵', items: soon.map((l) => `${l.name} · ${dDay(today, l.partner.nextReorder)} · ${nameOf(data.members, l.managerId)}`) })
  if (kind === 'morning') {
    const month = today.slice(0, 7)
    const won_ = (data.leads || []).filter((l) => l.contract?.status === 'won' && (l.contract.date || '').startsWith(month))
    const spent = (data.expenses || []).filter((e) => e.month === month && e.status !== 'rejected')
    sections.push({ h: '이번 달', items: [`계약 ${won_.length}건`, `비용 ${won(spent.reduce((n, e) => n + e.amount, 0))}원`] })
  } else {
    const c = (t) => activity.filter((a) => a.type === t).length
    sections.unshift({ h: '오늘 팀 전체', items: [`통화 ${c('call')} → 미팅 예약 ${c('book')} → 미팅 ${c('meet')} → 계약 ${activity.filter((a) => a.type === 'contract' && a.status === 'won').length}`] })
  }
  const title = `팀 ${kind === 'morning' ? '아침 리포트' : '저녁 리포트'} · ${dayLabel(today)}`
  return { title, sections, text: toText(title, sections) }
}

/** 미팅 1시간 전 알림에 들어갈 요약 */
export function meetingReminder(l, now = kst()) {
  const mins = minutesBetween(now.at, l.appt.at)
  const sections = [{ h: '고객', items: [`${l.name}${l.person ? ` · ${l.person}` : ''}`, [l.region, l.category].filter(Boolean).join(' · ') || '지역·업종 미입력', `${stageLabel(l)} · 통화 ${l.calls || 0}회 · 미팅 ${l.meetings || 0}회`] }]
  if (l.appt.place) sections.push({ h: '장소', items: [l.appt.place] })
  if (l.prep?.text) sections.push({ h: '다음 미팅 준비', items: l.prep.text.split('\n').filter(Boolean).slice(0, 10) })
  else if (l.lastText) sections.push({ h: '최근 기록', items: [l.lastText] })
  const title = `${mins > 0 ? `${mins}분 뒤` : '곧'} 미팅 · ${l.name}`
  return { title, sections, text: toText(title, sections) }
}

/** 주간 리포트 (대표용). activity = 이번 주 기록들 */
export function weeklyReport(data, activity, now = kst()) {
  const week = weekDays(now.date)
  const people = (data.members || []).filter((m) => m.role !== 'pending')
  const count = (type, uid) => activity.filter((a) => a.type === type && (!uid || a.by === uid)).length
  const wonWeek = activity.filter((a) => a.type === 'contract' && a.status === 'won')
  const spent = (data.expenses || []).filter((e) => e.date >= week[0] && e.date <= week[6] && e.status !== 'rejected')
  const next = buildTasks(data.leads, data.events).filter((t) => t.day > week[6] && t.day <= addDays(week[6], 7) && t.type === 'meet')
  const sections = [
    { h: '이번 주 영업', items: [`통화 ${count('call')}건 → 미팅 예약 ${count('book')}건 → 미팅 ${count('meet')}건 → 계약 ${wonWeek.length}건`] },
    { h: '사람별', items: people.map((m) => `${m.name}(${ROLES[m.role]?.short}) 통화 ${count('call', m.id)} · 미팅 ${count('meet', m.id)} · 기록 ${activity.filter((a) => a.by === m.id).length}`) },
    { h: `비용 ${won(spent.reduce((n, e) => n + e.amount, 0))}원`, items: topCats(spent) },
    { h: `다음 주 미팅 ${next.length}건`, items: next.slice(0, 10).map((t) => `${dayLabel(t.day)} ${t.at.slice(11, 16)} ${t.title}`) },
  ]
  const title = `주간 리포트 · ${dayLabel(week[0])} ~ ${dayLabel(week[6])}`
  return { title, sections, text: toText(title, sections) }
}

/** 월말 정산서 요약 */
export function monthlySettlement(expenses, members, month) {
  const rows = expenses.filter((e) => e.month === month && e.status !== 'rejected')
  const by = {}
  rows.forEach((e) => { (by[e.uid] ||= []).push(e) })
  const sections = [
    { h: `합계 ${won(rows.reduce((n, e) => n + e.amount, 0))}원 · ${rows.length}건`, items: topCats(rows) },
    { h: '사람별 (지급할 금액 = 개인 결제분)', items: Object.entries(by).map(([uid, list]) => `${nameOf(members, uid)} ${won(list.reduce((n, e) => n + e.amount, 0))}원 · 지급할 금액 ${won(list.filter((e) => e.pay !== 'company' && e.status !== 'paid').reduce((n, e) => n + e.amount, 0))}원`) },
  ]
  const waiting = rows.filter((e) => e.status === 'pending')
  if (waiting.length) sections.push({ h: `아직 승인 대기 ${waiting.length}건`, items: ['앱 → 비용 → 전체에서 승인해 주세요.'] })
  const title = `${Number(month.slice(5))}월 정산서`
  return { title, sections, text: toText(title, sections) }
}

// ── 도우미 ──
export function nameOf(members = [], id) { return members.find((m) => m.id === id)?.name || (id ? '팀원' : '담당 미정') }
const firstLine = (s) => String(s).split('\n').find((x) => x.trim())?.replace(/^[-·•\d.\s]+/, '').slice(0, 60) || ''
const dDay = (today, d) => { const n = daysBetween(today, d); return n === 0 ? '오늘' : n > 0 ? `D-${n}` : `${-n}일 지남` }
function topCats(rows) {
  const t = {}
  rows.forEach((e) => { t[e.category] = (t[e.category] || 0) + e.amount })
  const list = Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${EXP_CAT[k]?.n || '기타'} ${won(v)}원`)
  return list.length ? list : ['비용 없음']
}
export function toText(title, sections) {
  return [title, ...sections.map((s) => [`\n■ ${s.h}`, ...s.items.map((i) => `· ${i}`)].join('\n'))].join('\n')
}
