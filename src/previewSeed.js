// 미리보기용 예시 데이터 (실제 앱에는 들어가지 않음)
// 체험 모드 화면 확인용 예시 데이터 (앱에는 들어가지 않음)
const pad = (n) => String(n).padStart(2, '0')
const k = new Date(Date.now() + 9 * 3600e3)
const D = (n) => { const t = new Date(k.getTime() + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
const iso = (n = 0, h = 0) => new Date(Date.now() + n * 864e5 + h * 3600e3).toISOString()
const today = D(0), month = today.slice(0, 7)
const members = { u1: { name: '이소영', role: 'admin', title: '대표', email: 'a@x', tgChatId: 1 }, u2: { name: '황은경', role: 'tm', title: 'TM', freelance: true, email: 'b@x' }, u3: { name: '이자원', role: 'sales', title: '영업이사', freelance: true, email: 'c@x' }, u4: { name: '김현수', role: 'sales', title: '영업과장', freelance: true, email: 'd@x' } }
const L = (id, o) => ({ id, calls: 0, meetings: 0, manages: 0, checks: {}, createdAt: iso(-10), updatedAt: iso(-1), tmId: 'u2', salesId: 'u3', managerId: 'u4', ...o })
const leads = {
  a: L('a', { name: '망원동 초록카페', person: '김원장', phone: '01012345678', region: '마포구 망원동', category: '카페', stage: 'booked', appt: { at: `${today}T14:00`, place: '매장 방문' }, apptAck: false, calls: 2, lastText: '시음 행사에 관심. 원장님이 직접 맛보고 싶다고 함', lastBy: 'u2', updatedAt: iso(0, -2) }),
  b: L('b', { name: '상암 바디필라테스', person: '박실장', phone: '01022223333', region: '상암동', category: '필라테스·요가', stage: 'met', meetings: 2, calls: 1, appt: { at: `${D(1)}T11:00`, place: '스튜디오' }, apptAck: true, prep: { text: '지난번 이야기\n- 회원 대상 시음 이벤트를 원함, 가격 부담 질문\n\n다음 미팅에서 할 이야기\n- 샵인샵 진열 위치와 첫 입고 수량 제안\n- 회원 대상 체험 행사 날짜\n\n준비할 것\n- 시음용 샘플 2병, 컵 30개\n- 진열 가이드 출력본', at: iso(0, -5) }, lastText: '2번째 미팅: 회원 이벤트로 시작하고 싶어 함', lastBy: 'u3' }),
  c: L('c', { name: '연남 스킨랩', person: '최원장', phone: '0233334444', region: '연남동', category: '뷰티·피부샵', stage: 'called', nextCall: `${today}T16:30`, calls: 1, lastText: '오후에 다시 연락 달라고 함', lastBy: 'u2' }),
  d: L('d', { name: '합정 헬스앤짐', person: '', phone: '01055556666', region: '합정동', category: '헬스·PT', stage: 'new', lastText: '인스타 보고 문의', lastBy: 'u2' }),
  e: L('e', { name: '성산 건강마을', person: '정사장', phone: '01077778888', region: '성산동', category: '건강·웰니스샵', stage: 'won', meetings: 3, calls: 3, orders: 2, contract: { status: 'won', amount: 1200000, date: `${month}-03` }, partner: { since: `${month}-03`, cycleDays: 60, lastOrderAt: D(-58), nextReorder: D(2) }, lastText: '2차 주문 12병', lastBy: 'u4' }),
  f: L('f', { name: '서교 요가하우스', person: '한원장', phone: '01099990000', region: '서교동', category: '필라테스·요가', stage: 'nego', meetings: 3, contract: { status: 'nego', amount: 0, date: '' }, lastText: '계약서 검토 중', lastBy: 'u3' }),
  g: L('g', { name: '공덕 약손약국', phone: '0277778888', region: '공덕동', category: '약국', stage: 'won', orders: 1, contract: { status: 'won', amount: 600000, date: D(-20) }, partner: { since: D(-20), cycleDays: 60, lastOrderAt: D(-20), nextReorder: D(40) }, nextManage: `${D(3)}T15:00`, lastBy: 'u4', lastText: '진열 점검 예정' }),
}
const events = { ev1: { id: 'ev1', title: '오륜미네랄 체험 세미나', at: `${D(2)}T19:00`, place: '상암 IT타워 B136', who: 'all' } }
const activity = [
  ['a', '망원동 초록카페', 'book', 'u2', iso(0, -2), '내일 아니고 오늘 2시로 확정'], ['c', '연남 스킨랩', 'call', 'u2', iso(0, -3), '오후에 다시 연락'], ['b', '상암 바디필라테스', 'meet', 'u3', iso(-1), '회원 이벤트로 시작하고 싶어 함'],
  ['e', '성산 건강마을', 'order', 'u4', iso(-3), '2차 주문 12병'], ['f', '서교 요가하우스', 'contract', 'u3', iso(-4), '계약서 검토'], ['g', '공덕 약손약국', 'contract', 'u3', iso(-20), '계약 완료'],
  ['d', '합정 헬스앤짐', 'create', 'u2', iso(-2), '인스타 보고 문의'], ['a', '망원동 초록카페', 'call', 'u2', iso(-5), '관심 있음'],
].map(([leadId, leadName, type, by, at, text], i) => ({ id: 'a' + i, leadId, leadName, type, by, at, text, ...(type === 'contract' && leadId === 'g' ? { status: 'won', amount: 600000 } : {}) }))
const E = (id, uid, amount, category, status, n = 0, extra = {}) => ({ id, uid, amount, category, status, date: D(-n), month: D(-n).slice(0, 7), pay: 'personal', memo: '', hasReceipt: false, createdAt: iso(-n), via: 'app', ...extra })
const expenses = {
  x1: E('x1', 'u3', 5000, 'parking', 'approved', 0, { autoApproved: true, memo: '망원동 공영주차장', via: 'telegram' }),
  x2: E('x2', 'u3', 45000, 'entertain', 'pending', 1, { memo: '상암 바디필라테스 원장님 점심' }),
  x3: E('x3', 'u2', 62000, 'transport', 'pending', 2, { memo: '주유' }),
  x4: E('x4', 'u4', 12000, 'meal', 'approved', 3, { autoApproved: true }),
  x5: E('x5', 'u4', 38000, 'supplies', 'paid', 6, { memo: '시음 컵·샘플병' }),
  x6: E('x6', 'u3', 18000, 'shipping', 'approved', 40, { autoApproved: true }),
  x7: E('x7', 'u2', 90000, 'promo', 'paid', 70, { memo: '현수막' }),
}
const contents = {
  c1: { id: 'c1', channel: 'blog', title: '오륜미네랄 먹는법 | 물에 타서 하루 한 잔', body: '원액을 물에 10~30배 희석해 마십니다.', date: D(1), status: 'review', by: 'u1', byAgent: true, updatedAt: iso(0, -6) },
  c2: { id: 'c2', channel: 'instagram', title: '비 오는 날 따뜻한 미네랄 차', body: '디톡스에 좋은 따뜻한 한 잔', date: D(3), status: 'draft', by: 'u1', byAgent: true, updatedAt: iso(0, -6) },
  c3: { id: 'c3', channel: 'blog', title: '알프스 유통(ALFS) 소개', body: '오륜미네랄 총판', date: D(-3), status: 'published', by: 'u1', updatedAt: iso(-3) },
}
const agentRuns = [
  { id: 'r1', agent: 'secretary', title: '아침 브리핑 4명 발송', at: iso(0, -5), output: '이소영 · 황은경 · 이자원 · 김현수에게 텔레그램 발송', engine: '규칙' },
  { id: 'r2', agent: 'finance', title: '영수증 읽기 · 주차비 5,000원', at: iso(0, -3), output: '이자원 · 망원동 공영주차장 · 자동 승인', engine: 'Claude Haiku' },
  { id: 'r3', agent: 'scout', title: '통화 메모 → 고객 카드', at: iso(0, -2), output: '망원동 초록카페 · 미팅 예약 오늘 14:00 → 이자원 영업이사에게 배정', leadId: 'a', engine: 'Claude Haiku' },
  { id: 'r4', agent: 'sales', title: '다음 미팅 준비 · 상암 바디필라테스', at: iso(0, -5), output: '할 이야기 2개 · 준비물 2개', leadId: 'b', engine: 'Claude Haiku' },
  { id: 'r5', agent: 'marketing', title: '초안 2건', at: iso(-1), output: '블로그 1 · 인스타 1 (금지 표현 1개 표시)', engine: 'Gemini Flash-Lite' },
]
const store = { members, leads, logs: { b: [{ id: 'l1', type: 'meet', by: 'u3', at: iso(-1), count: 2, text: '회원 대상 시음 이벤트로 시작하고 싶어 함. 가격 부담 질문.', nextLabel: '다시 미팅', apptAt: `${D(1)}T11:00` }, { id: 'l2', type: 'prep', by: 'agent', agent: 'sales', at: iso(0, -5), text: '다음 미팅 준비 메모를 만들었어요' }] }, invites: {}, activity, events, expenses, receipts: {}, contents, agentRuns, settings: {} }
const session = { id: 'u1', email: 'aamarketing250611@gmail.com', name: '이소영' }

// 미리보기 빌드에서만: 처음 열면 예시 데이터를 넣고 '대표 이소영'으로 바로 들어갑니다
export function seedPreview() {
  try {
    if (!localStorage.getItem('alfs_work_demo_v2')) {
      localStorage.setItem('alfs_work_demo_v2', JSON.stringify(store))
      localStorage.setItem('alfs_demo_session', JSON.stringify(session))
    }
  } catch { /* 저장소를 못 쓰면 빈 체험 모드 */ }
}
