// 앱 → /api/app 에이전트 호출 테스트
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './fakeDb.js'
process.env.ANTHROPIC_API_KEY = 'K'; process.env.GEMINI_API_KEY = 'G'; process.env.TELEGRAM_BOT_TOKEN = 'T'
const sent = []; const engines = []
globalThis.fetch = async (url, opt = {}) => {
  const body = JSON.parse(opt.body || '{}')
  const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => '' })
  if (url.includes('telegram')) { sent.push(body); return ok({ ok: true, result: {} }) }
  if (url.includes('anthropic')) { engines.push('claude'); return ok({ content: [{ type: 'text', text: '지난번 이야기\n- 가격 질문\n다음 미팅에서 할 이야기\n- 첫 입고 수량\n준비할 것\n- 샘플' }] }) }
  if (url.includes('generativelanguage')) { engines.push('gemini'); return ok({ candidates: [{ content: { parts: [{ text: '{"title":"오륜미네랄 먹는법","body":"물에 타서 하루 한 잔. 디톡스 효과"}' }] } }] }) }
  throw new Error(url)
}
const db = fakeDb({
  members: { boss: { name: '대표', role: 'admin', tgChatId: 1 }, s1: { name: '황은경', role: 'sales', tgChatId: 3 }, wait: { name: '대기', role: 'pending' } },
  leads: { b: { name: '상암 필라테스', stage: 'met', meetings: 1, salesId: 's1', appt: { at: '2026-11-03T15:00' }, checks: {} } },
  expenses: { x: { uid: 's1', amount: 45000, status: 'pending', category: 'meal', date: '2026-10-28', month: '2026-10' } },
})
globalThis.__ALFS_FAKE_DB = db
globalThis.__ALFS_FAKE_AUTH = async (t) => ({ uid: t })
const { default: app } = await import('../api/app.js')
const call = async (uid, body) => { let code = 200, out; const res = { status(c) { code = c; return this }, json(j) { out = j; return this }, setHeader() {} }; await app({ method: 'POST', headers: { authorization: `Bearer ${uid}` }, body }, res); return { code, out } }

test('역할 대기·로그인 없는 사람은 거절', async () => {
  assert.equal((await call('wait', { action: 'status' })).code, 401)
  assert.equal((await call('', { action: 'status' })).code, 401)
})
test('미팅 준비: Claude Haiku 로 만들고 고객 카드·기록·에이전트 기록에 남김', async () => {
  const r = await call('s1', { action: 'prep', leadId: 'b' })
  assert.equal(r.code, 200); assert.match(r.out.prep.text, /첫 입고 수량/)
  assert.equal(db.store.get('leads/b').prep.engine, 'Claude Haiku')
  assert.ok(db.all('leads/b/logs').some((g) => g.type === 'prep' && g.agent === 'sales'))
  assert.ok(db.all('agentRuns').some((r) => r.agent === 'sales'))
  assert.equal(db.store.get('leads/b').lastBy, undefined) // 에이전트 기록은 '마지막 소식'을 덮지 않음
})
test('마케팅 초안: Gemini 먼저, 금지 표현을 표시', async () => {
  const r = await call('s1', { action: 'draft', topic: '먹는법', channel: 'blog' })
  assert.equal(r.out.engine, 'Gemini Flash-Lite'); assert.equal(engines.at(-1), 'gemini')
  assert.ok(r.out.issues.some((i) => i.word === '디톡스'))
})
test('비용 승인 요청 알림은 본인 대기 건만', async () => {
  assert.equal((await call('boss', { action: 'notify', kind: 'expense', id: 'x' })).out.ok, false)
  const r = await call('s1', { action: 'notify', kind: 'expense', id: 'x' })
  assert.equal(r.out.ok, true); assert.equal(sent.at(-1).chat_id, 1)
})
test('대표가 끈 에이전트는 동작 안 함', async () => {
  await db.collection('settings').doc('main').set({ agents: { marketing: { on: false } } })
  assert.equal((await call('s1', { action: 'draft', topic: 'x' })).code, 409)
})
