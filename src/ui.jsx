import { useEffect, useState } from 'react'
import { ROLES, STAGE, stageLabel } from '../shared/constants.js'

/* 공용 화면 조각 */

export function Sheet({ title, onClose, children, onSubmit, busy, submitLabel = '저장', wide }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const Tag = onSubmit ? 'form' : 'div'
  return (
    <div className="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Tag className={`panel ${wide ? 'panel-wide' : ''}`} role="dialog" aria-label={title} {...(onSubmit ? { onSubmit: (e) => { e.preventDefault(); onSubmit() }, noValidate: true } : {})}>
        <h2>{title}<button type="button" onClick={onClose} aria-label="닫기">×</button></h2>
        {children}
        {onSubmit && <button className="btn-primary" disabled={busy}>{busy ? '저장하는 중…' : submitLabel}</button>}
      </Tag>
    </div>
  )
}

export function useSave(ctx, onClose) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (fn, msg) => {
    setBusy(true); setErr('')
    try { const r = await fn(); if (msg) ctx.say(msg); onClose?.(r); return r } catch (e) { console.warn(e); setErr('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.') } finally { setBusy(false) }
  }
  return { busy, err, setErr, save }
}

export const Chips = ({ items, value, onChange, scroll }) => (
  <div className={`chips ${scroll ? 'scroll' : ''}`}>{items.map((o) => <button type="button" key={o.k} aria-pressed={value === o.k} onClick={() => onChange(o.k)}>{o.n}{o.c !== undefined && <small>{o.c}</small>}</button>)}</div>
)

export function PersonPick({ ctx, role, value, onChange, id, allowAll }) {
  const first = ctx.people.filter((m) => m.role === role)
  const rest = ctx.people.filter((m) => m.role !== role)
  return (
    <select id={id} className="inp" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowAll ? <option value="all">팀 전체</option> : <option value="">미정</option>}
      {first.map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLES[m.role].short})</option>)}
      {rest.length > 0 && <optgroup label={role ? '다른 팀원' : '팀원'}>{rest.map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLES[m.role]?.short})</option>)}</optgroup>}
    </select>
  )
}

export const StagePill = ({ l }) => <span className={`pill tone-${STAGE[l.stage]?.tone || 'gray'}`}>{stageLabel(l)}</span>
export const RoleTag = ({ role }) => role ? <span className={`role role-${role}`}>{ROLES[role]?.short}</span> : null

export const Group = ({ title, note, tone, count, action, children }) => (
  <section className={`group ${tone ? `group-${tone}` : ''}`}>
    <h3>{title}{count !== undefined && <span className="count">{count}</span>}{action && <span className="grow" />}{action}</h3>
    {note && <p className="muted small">{note}</p>}
    {children}
  </section>
)
export const Empty = ({ title, children }) => <div className="empty">{title && <b>{title}</b>}{children}</div>

// 숫자 입력 (쉼표)
export const moneyInput = (setter) => (e) => { const v = e.target.value.replace(/[^\d]/g, ''); setter(v ? Number(v).toLocaleString('ko-KR') : '') }
export const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0

// 아이콘 (선 하나짜리 단순 SVG)
const P = {
  today: 'M4 6h16M4 12h10M4 18h7M18 15l2 2 3-4',
  leads: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8',
  schedule: 'M4 7h16v13H4zM4 11h16M8 3v5M16 3v5',
  expenses: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  marketing: 'M3 11v3l11 5V6L3 11ZM14 9a3 3 0 0 1 0 6M18 7a6 6 0 0 1 0 10',
  partners: 'M3 9l2-5h14l2 5M3 9h18v11H3zM3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-5h6v5',
  agents: 'M12 3v3M6 8h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM9 13h.01M15 13h.01M9 16h6',
  dashboard: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  team: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  plus: 'M12 5v14M5 12h14',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
}
export const Icon = ({ k, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[k]} /></svg>
)
