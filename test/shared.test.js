import test from 'node:test'
import assert from 'node:assert/strict'
import { kst, addDays, weekDays, minutesBetween, lastDayOfMonth, fmtWhen, daysBetween } from '../shared/time.js'
import { buildTasks, briefingFor, weeklyReport, monthlySettlement, nextReorder, meetingReminder } from '../shared/work.js'
import { checkAd } from '../shared/adRules.js'
import { addMinutes } from '../api/cron.js'

test('KST: UTC 23:30 은 한국 다음 날 08:30', () => {
  const n = kst(new Date('2026-10-28T23:30:00Z'))
  assert.equal(n.date, '2026-10-29'); assert.equal(n.time, '08:30'); assert.equal(n.dow, 4); assert.equal(n.hm, 510)
})
test('날짜 계산', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02')
  assert.deepEqual(weekDays('2026-10-28').slice(0, 1), ['2026-10-26'])
  assert.equal(weekDays('2026-11-01')[6], '2026-11-01')
  assert.equal(minutesBetween('2026-10-28T13:00', '2026-10-28T14:00'), 60)
  assert.equal(lastDayOfMonth('2026-02-10'), '2026-02-28')
  assert.equal(fmtWhen('2026-10-29T14:00', '2026-10-28'), '내일 14:00')
  assert.equal(daysBetween('2026-10-28', '2026-12-27'), 60)
  assert.equal(addMinutes('2026-10-28T23:30', 75), '2026-10-29T00:45')
})
test('재발주 예상일 = 마지막 주문 + 주기', () => {
  assert.equal(nextReorder({ since: '2026-10-01', lastOrderAt: '2026-10-10', cycleDays: 60 }), '2026-12-09')
  assert.equal(nextReorder({ since: '2026-10-01' }), '2026-11-30')
})
const leads = [
  { id: 'a', name: '초록카페', stage: 'booked', appt: { at: '2026-10-28T14:00' }, apptAck: false, tmId: 'pm', salesId: 's1', checks: {} },
  { id: 'b', name: '스킨랩', stage: 'called', nextCall: '2026-10-27T10:00', tmId: 'pm', checks: {} },
  { id: 'c', name: '건강마을', stage: 'won', managerId: 'm1', partner: { nextReorder: '2026-10-29' }, checks: {} },
  { id: 'd', name: '무산샵', stage: 'lost', nextCall: '2026-10-28T10:00', tmId: 'pm', checks: {} },
]
const events = [{ id: 'e1', title: '세미나', at: '2026-10-28T19:00', who: 'all' }]
test('할 일: 진행 중 고객만, 재발주·행사 포함', () => {
  const t = buildTasks(leads, events)
  assert.deepEqual(t.map((x) => `${x.type}:${x.title}`), ['call:스킨랩', 'meet:초록카페', 'event:세미나', 'reorder:건강마을'])
  assert.equal(t.find((x) => x.type === 'reorder').ownerId, 'm1')
})
test('브리핑: PM 은 밀린 통화, 영업은 확인할 미팅', () => {
  const now = kst(new Date('2026-10-27T23:30:00Z'))
  const pm = briefingFor({ id: 'pm', name: '이자원', role: 'tm' }, { leads, events }, now)
  assert.match(pm.text, /밀린 일 1건/); assert.match(pm.text, /스킨랩/); assert.match(pm.text, /세미나/)
  const s = briefingFor({ id: 's1', name: '황은경', role: 'sales' }, { leads, events }, now)
  assert.match(s.text, /확인할 미팅 예약/); assert.match(s.text, /14:00 미팅 · 초록카페/)
  const a = briefingFor({ id: 'boss', name: '대표', role: 'admin' }, { leads, events, members: [{ id: 's1', name: '황은경' }], expenses: [{ status: 'pending', amount: 30000, month: '2026-10' }], contents: [] }, now)
  assert.match(a.text, /비용 1건 · 30,000원/); assert.match(a.text, /팀 오늘 미팅 1건/); assert.match(a.text, /재발주 때가 된 샵/)
})
test('미팅 알림 문구', () => {
  const r = meetingReminder({ ...leads[0], prep: { text: '지난번 이야기\n- 시음 관심' } }, kst(new Date('2026-10-28T04:00:00Z')))
  assert.match(r.title, /60분 뒤 미팅 · 초록카페/); assert.match(r.text, /시음 관심/)
})
test('주간 리포트·월 정산서', () => {
  const w = weeklyReport({ leads, events, members: [{ id: 'pm', name: '이자원', role: 'tm' }], expenses: [] }, [{ type: 'call', by: 'pm' }, { type: 'book', by: 'pm' }, { type: 'contract', status: 'won', by: 's1' }], kst(new Date('2026-10-30T08:00:00Z')))
  assert.match(w.text, /통화 1건 → 미팅 예약 1건 → 미팅 0건 → 계약 1건/)
  const m = monthlySettlement([{ uid: 'u', month: '2026-10', amount: 5000, category: 'parking', status: 'approved', pay: 'personal' }, { uid: 'u', month: '2026-10', amount: 9000, category: 'meal', status: 'rejected' }], [{ id: 'u', name: '황은경' }], '2026-10')
  assert.match(m.text, /합계 5,000원 · 1건/); assert.match(m.text, /지급할 금액 5,000원/)
})
test('광고 문구 검사', () => {
  assert.deepEqual(checkAd('하루 한 잔, 물에 타서 마셔요').length, 0)
  assert.ok(checkAd('디톡스 효과가 좋아요').some((i) => i.word === '디톡스'))
  assert.ok(checkAd('국무총리상 수상 제품').some((i) => i.word === '수상·특허'))
  assert.equal(checkAd('제조사 유디아미네랄의 국무총리상').length, 0)
})
