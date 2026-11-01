// 서버(텔레그램 봇·예약 작업) 통합 테스트 — 가짜 Firestore + 가짜 텔레그램/AI 응답
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './fakeDb.js'

process.env.TELEGRAM_BOT_TOKEN = 'T'; process.env.TELEGRAM_WEBHOOK_SECRET = 'S'; process.env.ANTHROPIC_API_KEY = 'K'; process.env.CRON_SECRET = 'C'; process.env.APP_URL = 'https://work.alfs.kr'
const sent = []
let memoReply = null
globalThis.fetch = async (url, opt = {}) => {
  const body = opt.body ? JSON.parse(opt.body) : {}
  const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j), arrayBuffer: async () => new ArrayBuffer(8) })
  if (url.includes('api.telegram.org/file/')) return ok({})
  if (url.includes('api.telegram.org')) {
    const method = url.split('/').at(-1)
    sent.push({ method, ...body })
    if (method === 'getFile') return ok({ ok: true, result: { file_path: 'photos/a.jpg' } })
    return ok({ ok: true, result: { message_id: 7 } })
  }
  if (url.includes('api.anthropic.com')) {
    const t = body.messages[0].content.at(-1).text
    const reply = t.includes('영수증') ? '{"amount": 45000, "date": "2026-10-27", "store": "한우집", "category": "entertain"}'
      : t.includes('메모:') ? JSON.stringify(memoReply)
        : '지난번 이야기\n- 시음에 관심\n다음 미팅에서 할 이야기\n- 진열 위치\n준비할 것\n- 샘플 2병'
    return ok({ content: [{ type: 'text', text: reply }] })
  }
  throw new Error(`unexpected fetch ${url}`)
}
const db = fakeDb({
  settings: { main: { realtime: true } }, // 앞쪽 테스트는 수시 알림을 켠 상태로
  members: {
    boss: { name: '이소영', role: 'admin', email: 'a@x', tgChatId: 100 },
    pm: { name: '이자원', role: 'tm', email: 'b@x', tgCode: '123456', tgCodeAt: new Date().toISOString() },
    s1: { name: '황은경', role: 'sales', email: 'c@x', tgChatId: 300 },
    m1: { name: '김현수', role: 'manager', email: 'd@x', tgChatId: 400 },
  },
  leads: {
    cafe: { name: '망원동 초록카페', stage: 'called', calls: 1, meetings: 0, tmId: 'pm', salesId: 's1', checks: {}, updatedAt: '2026-10-20T00:00:00Z' },
    shop: { name: '성산 건강마을', stage: 'won', managerId: 'm1', orders: 2, partner: { nextReorder: '2026-10-30', cycleDays: 60 }, checks: {}, updatedAt: '2026-10-20T00:00:00Z' },
    pil: { name: '상암 필라테스', stage: 'met', meetings: 2, salesId: 's1', tmId: 'pm', appt: { at: '2026-10-29T09:30', place: '스튜디오' }, apptAck: true, checks: {}, updatedAt: '2026-10-20T00:00:00Z' },
  },
})
globalThis.__ALFS_FAKE_DB = db
const { default: tg } = await import('../api/telegram.js')
const { runCron } = await import('../api/cron.js')
const { kst } = await import('../shared/time.js')
const call = async (update) => { const res = { code: 0, status(c) { this.code = c; return this }, send() { return this }, json() { return this } }; await tg({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'S' }, body: update }, res); return res.code }
const last = (chat) => sent.filter((m) => m.chat_id === chat).at(-1)

test('비밀 토큰이 틀리면 거절', async () => {
  const res = { code: 0, status(c) { this.code = c; return this }, send() { return this } }
  await tg({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'X' }, body: {} }, res)
  assert.equal(res.code, 401)
})

test('/start 코드로 텔레그램 연결', async () => {
  await call({ message: { chat: { id: 200 }, text: '/start 123456' } })
  assert.equal(db.store.get('members/pm').tgChatId, 200)
  assert.match(last(200).text, /이자원님, 연결됐어요/)
})

test('연결 안 된 사람은 안내만', async () => {
  await call({ message: { chat: { id: 999 }, text: '안녕' } })
  assert.match(last(999).text, /연결되지 않은 계정/)
})

test('PM 통화 메모 → 저장 버튼 → 통화 기록 + 미팅 예약 + 영업에게 배정 알림', async () => {
  memoReply = { kind: 'update', leadId: 'cafe', lead: null, event: 'call', callResult: 'talked', nextCall: null, appt: { at: '2026-10-30T14:00', place: '매장' }, summary: '김원장 시음 관심, 목요일 2시 미팅' }
  await call({ message: { chat: { id: 200 }, text: '초록카페 김원장 통화. 시음 관심 목요일 2시 미팅' } })
  const msg = last(200)
  assert.match(msg.text, /고객 기록 · 망원동 초록카페/); assert.match(msg.text, /미팅 예약/)
  const btn = msg.reply_markup.inline_keyboard[0][0].callback_data
  assert.match(btn, /^p:save:/)
  await call({ callback_query: { id: 'q1', data: btn, message: { chat: { id: 200 }, message_id: 7, text: '' } } })
  const l = db.store.get('leads/cafe')
  assert.equal(l.stage, 'booked'); assert.equal(l.calls, 2); assert.equal(l.appt.at, '2026-10-30T14:00'); assert.equal(l.apptAck, false)
  const toSales = sent.filter((m) => m.chat_id === 300 && /미팅 배정/.test(m.text || ''))
  assert.equal(toSales.length, 1); assert.equal(toSales[0].reply_markup.inline_keyboard[0][0].callback_data, 'a:ack:cafe')
  assert.ok(db.all('activity').some((a) => a.type === 'book' && a.leadId === 'cafe'))
  assert.equal(db.all('tgPending').length, 0)
})

test('영업이 확인 버튼 → apptAck + PM 알림', async () => {
  await call({ callback_query: { id: 'q2', data: 'a:ack:cafe', message: { chat: { id: 300 }, message_id: 7, text: '미팅 배정' } } })
  assert.equal(db.store.get('leads/cafe').apptAck, true)
  assert.match(last(200).text, /황은경님이 망원동 초록카페 미팅/)
})

test('새 고객 메모 → 카드 생성', async () => {
  memoReply = { kind: 'new', leadId: null, lead: { name: '합정 헬스앤짐', person: '박관장', phone: '010-1111-2222', region: '합정동', category: '헬스·PT' }, event: 'call', callResult: 'callback', nextCall: '2026-10-29T10:00', appt: null, summary: '내일 10시에 다시 연락' }
  await call({ message: { chat: { id: 200 }, text: '합정 헬스앤짐 박관장 010-1111-2222 내일 10시 다시 전화' } })
  const btn = last(200).reply_markup.inline_keyboard[0][0].callback_data
  await call({ callback_query: { id: 'q3', data: btn, message: { chat: { id: 200 }, message_id: 7 } } })
  const l = db.all('leads').find((x) => x.name === '합정 헬스앤짐')
  assert.ok(l); assert.equal(l.tmId, 'pm'); assert.equal(l.stage, 'called'); assert.equal(l.nextCall, '2026-10-29T10:00'); assert.equal(l.calls, 1)
})

test('영수증 사진 4.5만원 → 승인 대기 + 대표 승인 버튼 → 승인 → 올린 사람 알림', async () => {
  await call({ message: { chat: { id: 300 }, photo: [{ file_id: 'small', width: 320 }, { file_id: 'big', width: 1280 }], caption: '필라테스 원장님 점심' } })
  const e = db.all('expenses')[0]
  assert.equal(e.amount, 45000); assert.equal(e.status, 'pending'); assert.equal(e.category, 'entertain'); assert.equal(e.memo, '필라테스 원장님 점심'); assert.equal(e.via, 'telegram')
  assert.ok(db.store.has(`receipts/${e.id}`))
  const ask = sent.filter((m) => m.chat_id === 100 && /비용 승인 요청/.test(m.text || '')).at(-1)
  assert.ok(ask)
  await call({ callback_query: { id: 'q4', data: ask.reply_markup.inline_keyboard[0][0].callback_data, message: { chat: { id: 100 }, message_id: 7, text: '비용 승인 요청' } } })
  assert.equal(db.store.get(`expenses/${e.id}`).status, 'approved')
  assert.match(last(300).text, /승인 · 접대비 45,000원/)
})

test('대표가 아니면 승인 버튼이 안 먹힘', async () => {
  const id = db.all('expenses')[0].id
  db.store.get(`expenses/${id}`).status = 'pending'
  await call({ callback_query: { id: 'q5', data: `e:ok:${id}`, message: { chat: { id: 300 }, message_id: 7 } } })
  assert.equal(db.store.get(`expenses/${id}`).status, 'pending')
  assert.equal(sent.at(-1).text, '대표만 승인할 수 있어요')
})

test('수시 알림 끔(기본): 미팅 배정·승인 요청을 바로 보내지 않음', async () => {
  await db.collection('settings').doc('main').set({ realtime: false })
  const { notifyBooking, askApproval } = await import('../api/_lib/agents.js')
  const before = sent.length
  assert.equal(await notifyBooking('pil'), false)
  assert.equal(await askApproval({ id: 'z', amount: 50000, category: 'meal', date: '2026-10-29' }, { name: '황은경' }), false)
  assert.equal(sent.length, before)
})

test('예약 작업: 08:30 아침 브리핑 (각자 이름, 대표는 팀 리포트), 두 번 돌려도 한 번만, 수시 알림 없음', async () => {
  const before = sent.length
  const now = kst(new Date('2026-10-28T23:31:00Z')) // 한국 10/29(목) 08:31
  const r1 = await runCron(now)
  assert.ok(r1.done.some((d) => d.startsWith('morning:')))
  const out = sent.slice(before).filter((m) => m.method === 'sendMessage')
  const boss = out.filter((m) => m.chat_id === 100)
  assert.equal(boss.length, 1); assert.match(boss[0].text, /팀 아침 리포트/); assert.match(boss[0].text, /황은경/); assert.match(boss[0].text, /김현수/)
  const s1 = out.filter((m) => m.chat_id === 300)
  assert.equal(s1.length, 1); assert.match(s1[0].text, /황은경님/); assert.match(s1[0].text, /상암 필라테스/)
  assert.match(s1[0].text, /샘플 2병/) // 오늘 미팅 준비 메모가 자동으로 만들어져 아침 브리핑에 들어감
  assert.ok(!out.some((m) => /분 뒤 미팅|재발주 때가 된 파트너샵 \d곳/.test(m.text || ''))) // 1시간 전·10시 재발주 같은 수시 알림 없음
  const r2 = await runCron(now)
  assert.equal(r2.done.length, 0)
  const r3 = await runCron(kst(new Date('2026-10-29T01:05:00Z'))) // 10:05 — 보낼 것 없음
  assert.ok(!r3.done.some((d) => d.startsWith('morning') || d.startsWith('reorder')))
  assert.ok(db.all('agentRuns').some((r) => r.agent === 'secretary' && /아침 브리핑/.test(r.title)))
})

test('17:00 저녁 브리핑: 각자 오늘 정리·내일 일정, 대표는 팀 저녁 리포트', async () => {
  const before = sent.length
  const r = await runCron(kst(new Date('2026-10-29T08:05:00Z'))) // 10/29(목) 17:05
  assert.ok(r.done.some((d) => d.startsWith('evening:')))
  const out = sent.slice(before)
  assert.match(out.find((m) => m.chat_id === 300).text, /황은경님, .* 저녁 정리/)
  assert.match(out.find((m) => m.chat_id === 100).text, /팀 저녁 리포트/)
  assert.ok(!out.find((m) => m.chat_id === 100).text.includes('주간 리포트'))
})

test('금요일 저녁 리포트에는 주간 리포트가 붙고 대표에게만', async () => {
  const before = sent.length
  await runCron(kst(new Date('2026-10-29T23:40:00Z'))) // 금 08:40 아침
  const r = await runCron(kst(new Date('2026-10-30T08:05:00Z'))) // 금 17:05
  assert.ok(r.done.some((d) => d.startsWith('evening:')))
  const w = sent.slice(before).filter((m) => /주간 리포트/.test(m.text || ''))
  assert.equal(w.length, 1); assert.equal(w[0].chat_id, 100)
})

test('텔레그램: 오늘·저녁·리포트 요청에는 언제든 답함', async () => {
  const before = sent.length
  await call({ message: { chat: { id: 300 }, text: '저녁' } })
  assert.match(sent.slice(before).at(-1).text, /저녁 정리/)
  await call({ message: { chat: { id: 100 }, text: '리포트' } })
  assert.match(sent.at(-1).text, /팀 .* 리포트/)
})
