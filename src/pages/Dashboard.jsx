import { useMemo, useState } from 'react'
import { EXP_CATS, OPEN_STAGES, ROLES, STAGE } from '../../shared/constants.js'
import { daysBetween, shiftMonth, todayStr, won } from '../../shared/time.js'
import { Group } from '../ui.jsx'

const CAT_COLOR = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)', 'var(--c9)', 'var(--c10)']

/* 대시보드 (대표) — 고객 흐름, 사람별 성과, 비용 추이, 파트너샵 */
export default function Dashboard({ ctx }) {
  const { leads, activity, expenses, members } = ctx.data
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const act = activity.filter((a) => a.at.slice(0, 7) === month)
  const n = (type, extra = () => true) => act.filter((a) => a.type === type && extra(a)).length
  const funnel = [
    { k: '통화', v: n('call') },
    { k: '미팅 예약', v: n('book') },
    { k: '미팅', v: n('meet') },
    { k: '계약', v: n('contract', (a) => a.status === 'won') },
  ]
  const fmax = Math.max(1, ...funnel.map((f) => f.v))
  const stageCounts = [...OPEN_STAGES, 'won'].map((k) => ({ k, n: STAGE[k].n, v: leads.filter((l) => l.stage === k).length }))
  const smax = Math.max(1, ...stageCounts.map((s) => s.v))
  const people = members.filter((m) => m.role !== 'pending')
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))
  const byMonth = useMemo(() => months.map((m) => {
    const rows = expenses.filter((e) => e.month === m && e.status !== 'rejected')
    const cats = {}; rows.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + e.amount })
    return { m, total: rows.reduce((s, e) => s + e.amount, 0), cats }
  }), [expenses, months.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const emax = Math.max(1, ...byMonth.map((x) => x.total))
  const shops = leads.filter((l) => l.stage === 'won')
  const due = shops.filter((l) => l.partner?.nextReorder && daysBetween(today, l.partner.nextReorder) <= 7).length
  const late = shops.filter((l) => l.partner?.nextReorder && daysBetween(today, l.partner.nextReorder) < 0).length
  const contractSum = act.filter((a) => a.type === 'contract' && a.status === 'won').reduce((s, a) => s + (a.amount || 0), 0)
  const spent = byMonth.at(-1).total

  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">대시보드</h1>
        <div className="weeknav">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
          <b className="num">{month.replace('-', '.')}</b>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
        </div>
      </div>
      <div className="kpis kpis-4">
        <div><b>{leads.filter((l) => OPEN_STAGES.includes(l.stage)).length}</b>진행 중 예비샵</div>
        <div><b>{funnel[3].v}</b>{Number(month.slice(5))}월 계약{contractSum ? <small> · {won(contractSum)}원</small> : null}</div>
        <div><b>{shops.length}</b>파트너샵{due ? <small> · 재발주 {due}곳</small> : null}</div>
        <div><b className="num">{won(spent)}</b>{Number(month.slice(5))}월 비용 (원)</div>
      </div>

      <div className="dash-2">
        <Group title={`${Number(month.slice(5))}월 영업 흐름`} note="이 달에 남긴 기록 수예요. 통화가 미팅과 계약으로 얼마나 이어졌는지 봅니다.">
          <div className="funnel">
            {funnel.map((f, i) => (
              <div key={f.k} className="fun-row">
                <span>{f.k}</span>
                <i style={{ width: `${Math.max(2, (f.v / fmax) * 100)}%` }} />
                <b>{f.v}</b>
                <small>{i > 0 && funnel[i - 1].v ? `${Math.round((f.v / funnel[i - 1].v) * 100)}%` : ''}</small>
              </div>
            ))}
          </div>
        </Group>
        <Group title="지금 단계별 고객 수">
          <div className="bars">
            {stageCounts.map((s) => <div className="bar" key={s.k}><span>{s.n}</span><i className={`tone-${STAGE[s.k].tone}`} style={{ width: `${(s.v / smax) * 100}%` }} /><b>{s.v}</b></div>)}
          </div>
        </Group>
      </div>

      <Group title="사람별 성과" note={`${Number(month.slice(5))}월 기록 기준`}>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>이름</th><th>통화</th><th>미팅 예약</th><th>미팅</th><th>계약</th><th>샵 관리</th><th>비용 (원)</th></tr></thead>
            <tbody>
              {people.map((m) => {
                const mine = act.filter((a) => a.by === m.id)
                const c = (t, f = () => true) => mine.filter((a) => a.type === t && f(a)).length
                const cost = expenses.filter((e) => e.uid === m.id && e.month === month && e.status !== 'rejected').reduce((s, e) => s + e.amount, 0)
                return (
                  <tr key={m.id}>
                    <td><b>{m.name}</b> <span className={`role role-${m.role}`}>{ROLES[m.role]?.short}</span></td>
                    <td>{c('call')}</td><td>{c('book')}</td><td>{c('meet')}</td><td>{c('contract', (a) => a.status === 'won')}</td><td>{c('manage') + c('order')}</td><td>{won(cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Group>

      <div className="dash-2">
        <Group title="비용 추이 (최근 6개월)">
          <div className="ebars">
            {byMonth.map((x) => (
              <div key={x.m} className="ecol">
                <div className="estack" style={{ height: `${(x.total / emax) * 100}%` }} title={`${won(x.total)}원`}>
                  {EXP_CATS.map((c, ix) => x.cats[c.k] ? <i key={c.k} style={{ flexGrow: x.cats[c.k], background: CAT_COLOR[ix] }} /> : null)}
                </div>
                <b className="num">{x.total >= 10000 ? `${Math.round(x.total / 10000)}만` : won(x.total)}</b>
                <span>{Number(x.m.slice(5))}월</span>
              </div>
            ))}
          </div>
          <div className="legend">{EXP_CATS.map((c, ix) => byMonth.some((x) => x.cats[c.k]) && <span key={c.k}><i style={{ background: CAT_COLOR[ix] }} />{c.n}</span>)}</div>
        </Group>
        <Group title="파트너샵 재발주">
          <div className="kpis">
            <div><b>{shops.length}</b>전체</div>
            <div><b>{due}</b>7일 안</div>
            <div><b style={{ color: late ? 'var(--r)' : undefined }}>{late}</b>지남</div>
          </div>
          <button type="button" className="link small" onClick={() => ctx.go('partners')}>파트너샵 화면으로</button>
        </Group>
      </div>
    </div>
  )
}
