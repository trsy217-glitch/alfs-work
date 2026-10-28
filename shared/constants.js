// 알프스 워크 — 앱(화면)과 서버(에이전트·텔레그램·예약 작업)가 함께 쓰는 고정 값

// 역할 (이전 영업관리 앱과 같은 키: tm·sales·manager·admin → 데이터를 그대로 이어 씀)
export const ROLES = {
  admin: { n: '대표', short: '대표' },
  tm: { n: 'TM · 고객 발굴', short: 'TM' },
  sales: { n: '영업 · 대면 미팅', short: '영업' },
  manager: { n: '파트너샵 관리', short: '샵관리' },
  pending: { n: '역할 대기', short: '대기' },
}
export const ROLE_PICK = ['tm', 'sales', 'manager', 'admin']

// 고객마다 역할별 담당 3명: 발굴(TM) → 대면 미팅(영업) → 계약 후 관리(샵관리)
export const DUTIES = [
  { k: 'tmId', role: 'tm', n: '발굴 TM' },
  { k: 'salesId', role: 'sales', n: '영업' },
  { k: 'managerId', role: 'manager', n: '샵관리' },
]
export const OWNER_OF_STAGE = { new: 'tmId', called: 'tmId', booked: 'salesId', met: 'salesId', nego: 'salesId', won: 'managerId' }

// 고객 단계. 미팅은 1차·2차로 나누지 않고 '미팅 N회'로 셉니다 (대표 결정 2026-10-28)
export const STAGES = [
  { k: 'new', n: '발굴', tone: 'gray' },
  { k: 'called', n: '통화 중', tone: 'blue' },
  { k: 'booked', n: '미팅 예약', tone: 'violet' },
  { k: 'met', n: '미팅 진행', tone: 'teal' },
  { k: 'nego', n: '계약 협의', tone: 'amber' },
  { k: 'won', n: '파트너샵', tone: 'green' },
  { k: 'hold', n: '보류', tone: 'gray' },
  { k: 'lost', n: '무산', tone: 'red' },
]
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.k, s]))
export const OPEN_STAGES = ['new', 'called', 'booked', 'met', 'nego'] // = 예비샵
export const stageLabel = (l) => (l.stage === 'met' ? `미팅 ${l.meetings || 1}회` : STAGE[l.stage]?.n || '발굴')

export const CATEGORIES = ['건강·웰니스샵', '뷰티·피부샵', '카페', '헬스·PT', '필라테스·요가', '약국', '기타']

export const CALL_RESULTS = [
  { k: 'talked', n: '통화 완료' },
  { k: 'callback', n: '다시 연락 요청' },
  { k: 'noanswer', n: '부재중' },
  { k: 'reject', n: '관심 없음' },
]
export const CALL_RESULT = Object.fromEntries(CALL_RESULTS.map((s) => [s.k, s]))
export const MEETING_NEXT = [
  { k: 'again', n: '다시 미팅' },
  { k: 'nego', n: '계약 협의로' },
  { k: 'hold', n: '보류' },
  { k: 'lost', n: '무산' },
]
export const CONTRACT_STATUS = [
  { k: 'nego', n: '협의 중' },
  { k: 'won', n: '계약 완료' },
  { k: 'hold', n: '보류' },
  { k: 'lost', n: '무산' },
]
export const CONTRACT = Object.fromEntries(CONTRACT_STATUS.map((s) => [s.k, s]))

// 비용 항목 (일괄 정산 앱과 같은 키)
export const EXP_CATS = [
  { k: 'transport', n: '주유·교통', hint: '주유·톨게이트·택시·대중교통' },
  { k: 'parking', n: '주차비' },
  { k: 'meal', n: '식대', hint: '영업 중 본인 식사' },
  { k: 'entertain', n: '접대비', hint: '거래처 식사·선물. 누구(어느 매장)와 썼는지 꼭 적어 주세요. 3만원이 넘으면 카드 영수증이 있어야 비용으로 인정됩니다.' },
  { k: 'supplies', n: '물품대금', hint: '샘플·체험용품·소모품·물품 구입' },
  { k: 'promo', n: '홍보비', hint: '전단·현수막·인쇄·광고' },
  { k: 'shipping', n: '택배·퀵' },
  { k: 'event', n: '세미나·행사' },
  { k: 'lodging', n: '숙박' },
  { k: 'etc', n: '기타' },
]
export const EXP_CAT = Object.fromEntries(EXP_CATS.map((c) => [c.k, c]))
export const EXP_STATUS = { pending: '승인 대기', approved: '승인', rejected: '반려', paid: '지급 완료' }
// 이 금액 이상은 대표 승인 (대표 결정 2026-10-28). 설정 화면에서 바꿀 수 있음
export const DEFAULT_APPROVAL_LIMIT = 20000

// 일정 종류 (고객 카드에서 나오는 일정 + 따로 넣는 일정)
export const TASK_TYPES = [
  { k: 'call', n: '통화', duty: 'tmId', tone: 'blue' },
  { k: 'meet', n: '미팅', duty: 'salesId', tone: 'violet' },
  { k: 'manage', n: '샵 관리', duty: 'managerId', tone: 'green' },
  { k: 'reorder', n: '재발주', duty: 'managerId', tone: 'amber' },
  { k: 'event', n: '행사·기타', duty: null, tone: 'teal' },
]
export const TASK = Object.fromEntries(TASK_TYPES.map((t) => [t.k, t]))

// 마케팅 콘텐츠
export const CHANNELS = [
  { k: 'blog', n: '네이버 블로그' },
  { k: 'instagram', n: '인스타그램' },
  { k: 'shop', n: '파트너샵 배포용' },
  { k: 'etc', n: '기타' },
]
export const CHANNEL = Object.fromEntries(CHANNELS.map((c) => [c.k, c]))
export const CONTENT_STATUS = { draft: '초안', review: '승인 요청', approved: '승인', published: '발행 완료' }

// 에이전트 7개 (기획서 3장)
export const AGENTS = [
  { k: 'secretary', n: '비서', dept: '대표실', does: '아침 브리핑, 주간 리포트, 일정 겹침 확인' },
  { k: 'scout', n: '발굴', dept: '고객발굴팀', does: '통화 메모 → 고객 카드, 미팅 예약 넘김' },
  { k: 'sales', n: '영업지원', dept: '영업팀', does: '미팅 1시간 전 요약, 미팅 기록 정리, 다음 미팅 준비' },
  { k: 'shop', n: '샵관리', dept: '파트너샵 관리팀', does: '재발주 시점 알림, 샵 현황 정리' },
  { k: 'finance', n: '정산', dept: '재무·정산', does: '영수증 읽기, 2만원 이상 승인 요청, 월말 정산서' },
  { k: 'marketing', n: '마케팅', dept: '마케팅·홍보', does: '블로그·인스타 초안, 금지 표현 검사, 발행 일정' },
  { k: 'stock', n: '재고', dept: '물류·재고', does: '2차 개발 예정', later: true },
]
export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.k, a]))

export const DEFAULT_REORDER_DAYS = 60 // 1,000ml 한 병을 하루 15ml 마시면 약 두 달
