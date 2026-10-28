import { useState } from 'react'
import { daysBetween, fmtWhen, todayStr, won } from '../../shared/time.js'
import { Empty, Group } from '../ui.jsx'
import { OrderSheet } from './LeadDetail.jsx'

/* 파트너샵 — 계약한 샵의 재발주 때와 주문 현황 (재고 관리는 2차) */
export default function Partners({ ctx }) {
  const today = todayStr()
  const [order, setOrder] = useState(null)
  const [mine, setMine] = useState(ctx.me.role === 'manager')
  const shops = ctx.data.leads.filter((l) => l.stage === 'won' && (!mine || l.managerId === ctx.user.id))
  const d = (l) => (l.partner?.nextReorder ? daysBetween(today, l.partner.nextReorder) : 9999)
  const due = shops.filter((l) => d(l) <= 7).sort((a, b) => d(a) - d(b))
  const rest = shops.filter((l) => d(l) > 7).sort((a, b) => d(a) - d(b))
  const month = today.slice(0, 7)
  const monthOrders = ctx.data.activity.filter((a) => a.type === 'order' && a.at.slice(0, 7) === month)
  const newShops = ctx.data.leads.filter((l) => l.stage === 'won' && (l.contract?.date || '').startsWith(month)).length

  return (
    <div className="stack">
      <div className="page-h"><h1 className="h">파트너샵</h1></div>
      <div className="kpis">
        <div><b>{shops.length}</b>파트너샵</div>
        <div><b>{due.length}</b>7일 안 재발주</div>
        <div><b>{newShops}</b>이번 달 새 계약</div>
        <div><b>{monthOrders.length}</b>이번 달 주문</div>
      </div>
      <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내가 관리하는 샵만</label>
      <Group title="재발주 때가 된 샵" tone={due.length ? 'alert' : undefined} count={due.length} note="샵관리 에이전트가 매일 10시에 담당자에게 알려 드려요. 연락은 담당자가 판단해서 해 주세요.">
        {due.length ? <div className="list">{due.map((l) => <ShopRow key={l.id} l={l} ctx={ctx} today={today} onOrder={() => setOrder(l)} />)}</div> : <Empty>일주일 안에 재발주할 샵이 없어요.</Empty>}
      </Group>
      <Group title="전체 파트너샵" count={rest.length}>
        {rest.length ? <div className="list">{rest.map((l) => <ShopRow key={l.id} l={l} ctx={ctx} today={today} onOrder={() => setOrder(l)} />)}</div>
          : !due.length && <Empty title="아직 파트너샵이 없어요">고객 카드에서 '계약 상황 → 계약 완료'로 저장하면 여기로 옮겨져요.</Empty>}
      </Group>
      <p className="muted small">재고·출고 관리는 2차 개발에서 붙습니다. 지금은 주문 기록으로 재발주 예상일을 계산해요.</p>
      {order && <OrderSheet l={order} ctx={ctx} onClose={() => setOrder(null)} />}
    </div>
  )
}

function ShopRow({ l, ctx, today, onOrder }) {
  const n = l.partner?.nextReorder ? daysBetween(today, l.partner.nextReorder) : null
  const tag = n === null ? '주문 기록 없음' : n < 0 ? `${-n}일 지남` : n === 0 ? '오늘' : `D-${n}`
  return (
    <div className="shop">
      <button type="button" className="shop-main" onClick={() => ctx.openLead(l.id)}>
        <span className="card-h"><b>{l.name}</b><span className={`pill tone-${n !== null && n <= 0 ? 'red' : n !== null && n <= 7 ? 'amber' : 'green'}`}>{tag}</span></span>
        <span className="card-s">{[l.category, l.region].filter(Boolean).join(' · ')} · 관리 {ctx.nameOf(l.managerId) || '미정'}</span>
        <span className="card-f">마지막 주문 {l.partner?.lastOrderAt ? fmtWhen(l.partner.lastOrderAt) : '—'} · 주문 {l.orders || 0}회{l.contract?.amount ? ` · 첫 주문 ${won(l.contract.amount)}원` : ''}</span>
      </button>
      <button type="button" className="btn-mini" onClick={onOrder}>주문 기록</button>
    </div>
  )
}
