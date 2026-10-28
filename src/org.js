// 알프스 조직 — 부서·담당 역할·에이전트 (기획서 2·3장)
import { OPEN_STAGES } from '../shared/constants.js'
import { daysBetween, fmtWhen, kst } from '../shared/time.js'

export const DEPTS = [
  { k: 'ceo', n: '대표실', sub: '총괄·직원·승인', roles: ['admin'], agent: 'secretary' },
  { k: 'scout', n: '고객발굴팀', sub: '전화 발굴 → 미팅 예약', roles: ['tm'], agent: 'scout' },
  { k: 'sales', n: '영업팀', sub: '대면 미팅 → 계약', roles: ['sales'], agent: 'sales' },
  { k: 'partners', n: '파트너샵 관리팀', sub: '계약 후 관리·재발주 (당분간 영업팀 겸임)', roles: ['manager'], fallback: ['sales'], agent: 'shop' },
  { k: 'finance', n: '재무·정산', sub: '비용·세무 (대표 + 세무사)', roles: ['admin'], agent: 'finance' },
  { k: 'marketing', n: '마케팅·홍보', sub: '콘텐츠·채널', roles: ['admin'], agent: 'marketing' },
  { k: 'stock', n: '물류·재고', sub: '2차 개발', roles: [], agent: 'stock', later: true },
]
export const DEPT = Object.fromEntries(DEPTS.map((d) => [d.k, d]))

// 에이전트 얼굴·엔진·일정
export const AGENT_FACE = { secretary: '🗂️', scout: '🔭', sales: '🤝', shop: '🏪', finance: '🧾', marketing: '📣', stock: '📦' }
export const ENGINE = {
  secretary: '규칙 기반', scout: 'Claude Haiku · 음성 Gemini', sales: 'Claude Haiku', shop: '규칙 기반',
  finance: 'Claude Haiku', marketing: 'Gemini Flash-Lite', stock: '—',
}
export const SCHEDULE = {
  secretary: '평일 08:30 브리핑 · 금 17:00 주간 리포트', scout: '텔레그램 메모가 올 때', sales: '미팅 1시간 전 · 미팅 결과 저장 때',
  shop: '매일 10:00 재발주 알림', finance: '영수증이 올 때 · 말일 정산서', marketing: '화·목 09:00 초안', stock: '2차 개발',
}

// 상단 메뉴 (항상 보임)
export const TABS = [
  { k: 'hq', n: '본사' },
  { k: 'ceo', n: '대표실' },
  { k: 'scout', n: '고객발굴' },
  { k: 'sales', n: '영업' },
  { k: 'partners', n: '파트너샵' },
  { k: 'finance', n: '정산' },
  { k: 'marketing', n: '마케팅' },
  { k: 'schedule', n: '일정' },
  { k: 'agents', n: 'AI 팀' },
  { k: 'team', n: '설정' },
]

/** 에이전트 지금 상태: off · working(최근 15분 안에 일함) · idle(+ 다음 할 일) */
export function agentState(k, { settings, runs = [], leads = [] }) {
  if (k === 'stock') return { st: 'later', line: '2차 개발 예정' }
  if (settings?.agents?.[k]?.on === false) return { st: 'off', line: '꺼짐' }
  const last = runs.find((r) => r.agent === k)
  if (last && Date.now() - new Date(last.at) < 15 * 6e4) return { st: 'working', line: last.title }
  const n = kst()
  const next = {
    secretary: n.dow >= 1 && n.dow <= 5 && n.hm < 510 ? '오늘 08:30 브리핑 준비' : n.dow === 5 && n.hm < 1020 ? '오늘 17:00 주간 리포트' : '다음 평일 08:30 브리핑',
    scout: '메모 기다리는 중',
    sales: (() => { const up = leads.filter((l) => OPEN_STAGES.includes(l.stage) && l.appt?.at && l.appt.at >= n.at).sort((a, b) => a.appt.at.localeCompare(b.appt.at))[0]; return up ? `${fmtWhen(up.appt.at)} 미팅 준비 대기` : '다음 미팅 기다리는 중' })(),
    shop: (() => { const due = leads.filter((l) => l.stage === 'won' && l.partner?.nextReorder && daysBetween(n.date, l.partner.nextReorder) <= 3).length; return due ? `재발주 ${due}곳 확인 대기` : n.hm < 600 ? '오늘 10:00 재발주 확인' : '내일 10:00 재발주 확인' })(),
    finance: '영수증 기다리는 중',
    marketing: n.dow === 2 || n.dow === 4 ? (n.hm < 540 ? '오늘 09:00 초안 작성' : '다음 초안 화·목') : '다음 초안 화·목 09:00',
  }[k]
  return { st: 'idle', line: next, last }
}

/** 부서 사람: 그 역할 팀원, 없으면 겸임 역할 */
export function deptPeople(d, people) {
  const a = people.filter((m) => d.roles.includes(m.role))
  return a.length || !d.fallback ? a : people.filter((m) => d.fallback.includes(m.role))
}
export const titleOf = (m) => m?.title || ''
