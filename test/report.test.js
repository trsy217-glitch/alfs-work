// 주간 고객 리포트 · 구글 시트 보내기
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './fakeDb.js'
import { weeklyCustomerReport, weekKey, mondayOf, weekRange, activityRow } from '../shared/report.js'

const at = (kstAt) => new Date(Date.parse(`${kstAt}:00+09:00`)).toISOString()
const members = [{ id: 'tm', name: '황은경', role: 'tm' }, { id: 'sa', name: '이자원', role: 'sales' }, { id: 'p', name: '대기', role: 'pending' }]
const leads = [{ id: 'a', name: '상암 필라테스', region: '마포구', category: '필라테스·요가', stage: 'nego', meetings: 1 }, { id: 'b', name: '망원 카페', stage: 'lost' }]
const activity = [
  activityRow(leads[0], { type: 'create', by: 'tm', at: at('2026-11-01T09:00') }), // 일요일 → 지난주
  activityRow(leads[0], { type: 'call', by: 'tm', at: at('2026-11-01T23:59'), result: 'talked' }), // 일요일 밤 → 지난주
  activityRow(leads[0], { type: 'call', by: 'tm', at: at('2026-11-02T00:00'), result: 'talked', text: '관심 있음' }), // 월요일 0시 → 이번 주
  activityRow(leads[1], { type: 'call', by: 'tm', at: at('2026-11-03T10:00'), result: 'noanswer' }),
  activityRow(leads[0], { type: 'book', by: 'tm', at: at('2026-11-03T11:00'), apptAt: '2026-11-05T15:00', place: '상암 매장' }),
  activityRow(leads[0], { type: 'meet', by: 'sa', at: at('2026-11-05T16:00'), next: 'nego', nextLabel: '계약 협의' }),
  activityRow(leads[1], { type: 'contract', by: 'sa', at: at('2026-11-07T10:00'), status: 'lost' }),
  activityRow(leads[0], { type: 'contract', by: 'sa', at: at('2026-11-08T23:59'), status: 'won', amount: 16500000 }), // 일요일 밤 → 이번 주
  activityRow(leads[0], { type: 'call', by: 'tm', at: at('2026-11-09T00:00'), result: 'talked' }), // 다음 주 월요일 → 다음 주
  activityRow(leads[0], { type: 'note', by: 'sa', at: at('2026-11-04T10:00'), text: '메모는 리포트에 안 셈' }),
]

test('주차 계산 (ISO, 월요일 시작)', () => {
  assert.equal(mondayOf('2026-11-08'), '2026-11-02')
  assert.equal(mondayOf('2026-11-03'), '2026-11-02')
  assert.equal(weekKey('2026-11-02'), '2026-W45')
  assert.equal(weekKey('2025-12-29'), '2026-W01')
  assert.equal(weekKey('2027-01-04'), '2027-W01')
  assert.deepEqual(weekRange('2026-11-02'), { startIso: '2026-11-01T15:00:00.000Z', endIso: '2026-11-08T15:00:00.000Z' })
})

test('한 주 집계: 경계(일요일 밤·월요일 0시), 결과 문구, 담당자별', () => {
  const r = weeklyCustomerReport({ leads, members, activity }, '2026-11-02')
  const s = r.summary
  assert.equal(s.week, '2026-W45')
  assert.deepEqual([s.scouted, s.calls, s.talked, s.booked, s.met, s.won, s.lost, s.amount, s.customers], [0, 2, 1, 1, 1, 1, 1, 16500000, 2])
  assert.equal(r.rows.length, 6)
  assert.equal(r.rows.find((x) => x.type === 'book').result, '11.5 (목) 15:00 · 상암 매장')
  assert.equal(r.rows.find((x) => x.type === 'meet').result, '계약 협의')
  assert.equal(r.rows.find((x) => x.type === 'call' && x.lead === '망원 카페').result, '부재중')
  assert.equal(r.rows.at(-1).at, '2026-11-08 23:59')
  assert.equal(r.rows[0].at, '2026-11-02 00:00')
  assert.equal(r.rows[0].region, '마포구')
  assert.deepEqual(r.people.map((p) => p.name), ['황은경', '이자원'])
  assert.equal(r.people[0].calls, 2)
  assert.equal(r.people[1].won, 1)
})

test('지난주는 일요일 밤 기록까지', () => {
  const s = weeklyCustomerReport({ leads, members, activity }, '2026-10-26').summary
  assert.equal(s.scouted, 1); assert.equal(s.calls, 1)
})

test('앱 → 구글 시트 보내기: 대표만, SECRET·내용 확인', async () => {
  process.env.REPORT_SHEET_URL = 'https://script.google.com/macros/s/X/exec'
  process.env.REPORT_SHEET_SECRET = 'S'
  const posted = []
  globalThis.fetch = async (url, opt = {}) => { posted.push(JSON.parse(opt.body)); return { ok: true, status: 200, text: async () => 'ok', json: async () => ({}) } }
  const store = { members: Object.fromEntries(members.concat([{ id: 'boss', name: '대표', role: 'admin' }]).map((m) => [m.id, m])), leads: Object.fromEntries(leads.map((l) => [l.id, l])), activity: Object.fromEntries(activity.map((a, i) => [`x${i}`, a])) }
  globalThis.__ALFS_FAKE_DB = fakeDb(store)
  globalThis.__ALFS_FAKE_AUTH = async (t) => ({ uid: t })
  const { default: app } = await import('../api/app.js')
  const call = async (uid, body) => { let code = 200, out; const res = { status(c) { code = c; return this }, json(j) { out = j; return this }, setHeader() {} }; await app({ method: 'POST', headers: { authorization: `Bearer ${uid}` }, body }, res); return { code, out } }

  assert.equal((await call('tm', { action: 'weekSheet', week: '2026-11-05' })).code, 403)
  const r = await call('boss', { action: 'weekSheet', week: '2026-11-05' })
  assert.equal(r.out.ok, true)
  assert.equal(r.out.rows, 6)
  const p = posted.at(-1)
  assert.equal(p.secret, 'S'); assert.equal(p.by, '대표'); assert.equal(p.summary.week, '2026-W45'); assert.equal(p.summary.from, '2026-11-02')

  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'no' })
  const bad = await call('boss', { action: 'weekSheet', week: '2026-11-05' })
  assert.equal(bad.out.ok, false); assert.match(bad.out.reason, /SECRET/)
})
