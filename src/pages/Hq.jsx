import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT } from '../../shared/constants.js'
import { buildTasks, isMine } from '../../shared/work.js'
import { daysBetween, dayLabel, fmtAgo, kst, todayStr } from '../../shared/time.js'
import { DEPTS, AGENT_FACE, agentState, deptPeople } from '../org.js'

/* 본사 — 알프스를 가운데 둔 나선형 조직도 + AI 팀 대기실 */
export default function Hq({ ctx, runs }) {
  const { data, settings } = ctx
  const today = todayStr()
  const wrap = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const tasks = useMemo(() => buildTasks(data.leads, data.events), [data.leads, data.events])
  const counts = useMemo(() => ({
    ceo: (ctx.isAdmin ? data.expenses.filter((e) => e.status === 'pending').length + data.contents.filter((c) => c.status === 'review').length : 0),
    scout: data.leads.filter((l) => l.stage === 'new' || (l.stage === 'called' && l.nextCall?.slice(0, 10) <= today)).length,
    sales: tasks.filter((t) => t.type === 'meet' && t.day === today && !t.done).length + data.leads.filter((l) => l.appt && !l.apptAck && ['booked', 'met'].includes(l.stage)).length,
    partners: data.leads.filter((l) => l.stage === 'won' && l.partner?.nextReorder && daysBetween(today, l.partner.nextReorder) <= 7).length,
    finance: data.expenses.filter((e) => e.status === 'pending').length,
    marketing: data.contents.filter((c) => c.status === 'review' || c.status === 'draft').length,
  }), [data, tasks, today, ctx.isAdmin])
  const label = { ceo: '승인 대기', scout: '오늘 연락', sales: '오늘 미팅·확인', partners: '7일 안 재발주', finance: '승인 대기', marketing: '검토할 글' }

  const narrow = w > 0 && w < 700
  const W = w || 900
  const card = narrow ? { w: Math.min(170, Math.floor(W / 2) - 12), h: 100 } : { w: 196, h: 112 }
  const geo = useMemo(() => (narrow ? helix(W, card, DEPTS.length) : spiral(W, Math.round(W * 0.62), card, DEPTS.length)), [W, narrow]) // eslint-disable-line react-hooks/exhaustive-deps
  const H = geo.H

  const people = (d) => deptPeople(d, ctx.people)
  const live = DEPTS.map((d) => ({ d, s: agentState(d.agent, { settings, runs, leads: data.leads }) }))
  const working = live.filter((x) => x.s.st === 'working').length
  const myToday = tasks.filter((t) => isMine(t, ctx.user.id) && t.day <= today && !t.done).length
  const n = kst()

  return (
    <div className="hq">
      <section className="hq-head">
        <div>
          <p className="eyebrow">ALFS HQ · {dayLabel(today)} {n.time}</p>
          <h1 className="hq-title">알프스 본사</h1>
          <p className="muted">부서를 누르면 그 부서의 일로 들어갑니다.</p>
        </div>
        <dl className="hq-stats">
          <div><dt>내 오늘 할 일</dt><dd className="num">{myToday}</dd></div>
          <div><dt>진행 중 예비샵</dt><dd className="num">{data.leads.filter((l) => ['new', 'called', 'booked', 'met', 'nego'].includes(l.stage)).length}</dd></div>
          <div><dt>파트너샵</dt><dd className="num">{data.leads.filter((l) => l.stage === 'won').length}</dd></div>
          <div><dt>AI 팀</dt><dd><span className="num">{working}</span><small> 작업 · {live.filter((x) => x.s.st === 'idle').length} 대기</small></dd></div>
        </dl>
      </section>

      <section className="org" ref={wrap} style={{ height: H }} aria-label="알프스 조직도">
        <svg className="org-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <defs>
            <radialGradient id="core-glow"><stop offset="0" stopColor="var(--gold)" stopOpacity=".28" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={geo.cx} cy={geo.cy} r={narrow ? 110 : 170} fill="url(#core-glow)" />
          {geo.path2 && <path d={geo.path2} className="spiral-base thin" />}
          <path d={geo.path} className="spiral-base" />
          <path d={geo.path} className="spiral-flow" />
          {geo.nodes.map((p, i) => <line key={i} x1={p.sx} y1={p.sy} x2={p.x} y2={p.y} className="spoke" />)}
          {geo.nodes.map((p, i) => <circle key={`d${i}`} cx={p.sx} cy={p.sy} r="4" className="joint" />)}
        </svg>

        <div className="core" style={{ left: geo.cx, top: geo.cy }}>
          <div className="core-ring" aria-hidden="true" />
          <b>ALFS</b>
          <span>알프스</span>
          <small>대표 {ctx.people.find((m) => m.role === 'admin')?.name || '—'}</small>
        </div>

        {live.map(({ d, s }, i) => {
          const p = geo.nodes[i]
          const ppl = people(d)
          const c = counts[d.k] || 0
          return (
            <button type="button" key={d.k} className={`dept ${d.later ? 'is-later' : ''}`} style={{ left: p.x, top: p.y, width: card.w }}
              onClick={() => (d.later ? ctx.say('물류·재고는 2차 개발에서 열려요') : ctx.go(d.k))} aria-label={`${d.n} 열기`}>
              <span className="dept-h"><b>{d.n}</b>{c > 0 && <i className="dept-n" title={label[d.k]}>{c}</i>}</span>
              <span className="dept-sub">{d.sub}</span>
              <span className="dept-team">
                {ppl.slice(0, 3).map((m) => <span key={m.id} className="ava" title={`${m.name}${m.title ? ` ${m.title}` : ''}`}>{m.name.slice(-2)}</span>)}
                {ppl.length > 3 && <span className="ava ava-more">+{ppl.length - 3}</span>}
                {!ppl.length && !d.later && <span className="muted tiny">담당 미정</span>}
                <span className={`bot-chip st-${s.st}`} title={`${AGENT[d.agent].n} 에이전트 · ${s.line}`}><em>{AGENT_FACE[d.agent]}</em><i /></span>
              </span>
            </button>
          )
        })}
      </section>

      <section className="lounge" aria-label="AI 팀 대기실">
        <div className="lounge-h">
          <div><p className="eyebrow">AI TEAM</p><h2>AI 팀 대기실</h2></div>
          <button type="button" className="btn-ghost sm" onClick={() => ctx.go('agents')}>한 일 전체 보기</button>
        </div>
        <div className="desks">
          {live.map(({ d, s }) => (
            <button type="button" key={d.agent} className={`desk st-${s.st}`} onClick={() => (d.later ? ctx.say('재고 에이전트는 2차 개발에서 합류해요') : ctx.go(d.k))}>
              <span className="desk-face" aria-hidden="true"><em>{AGENT_FACE[d.agent]}</em></span>
              <span className="desk-body">
                <b>{AGENT[d.agent].n}</b><span className="desk-dept">{d.n}</span>
                <span className="desk-bubble"><i className="dotst" />{s.st === 'working' ? '작업 중 · ' : s.st === 'idle' ? '대기 중 · ' : ''}{s.line}</span>
                {s.last && <span className="desk-last">최근 {fmtAgo(s.last.at)} · {s.last.title}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/** 나선 위 부서 자리 계산 (가운데 알프스에서 바깥으로 1.6바퀴) */
function spiral(W, H, card, n) {
  const narrow = false
  const cx = W / 2, cy = H / 2
  const RX = W / 2 - card.w / 2 - 6
  const RY = H / 2 - card.h / 2 - 6
  const t0 = narrow ? 0.35 : 0.6, step = narrow ? 1.62 : 1.5
  const rIn = narrow ? 0.5 : 0.52
  const tMax = t0 + step * (n - 1)
  const tIn = 5.2
  const rAt = (t) => (t < t0 ? rIn * Math.max(0, (t - (t0 - tIn)) / tIn) ** 0.9 : rIn + (1 - rIn) * ((t - t0) / (tMax - t0)))
  const at = (t) => { const r = rAt(t); const a = t - Math.PI / 2; return [cx + RX * r * Math.cos(a), cy + RY * r * Math.sin(a)] }
  const pts = []
  for (let t = t0 - tIn + 0.9; t <= tMax + 0.25; t += 0.04) pts.push(at(t))
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  const nodes = Array.from({ length: n }, (_, i) => {
    const t = t0 + step * i
    const [sx, sy] = at(t)
    const x = Math.min(W - card.w / 2 - 4, Math.max(card.w / 2 + 4, sx))
    const y = Math.min(H - card.h / 2 - 4, Math.max(card.h / 2 + 4, sy))
    return { x, y, sx, sy }
  })
  return { path, nodes, H, cx, cy }
}

/** 휴대폰: 알프스에서 아래로 감겨 내려가는 나선(코일) — 부서가 좌우로 번갈아 */
function helix(W, card, n) {
  const cx = W / 2, cy = 74
  const RX = W / 2 - card.w / 2 - 6
  const step = 82, y0 = cy + 110
  const H = Math.round(y0 + step * (n - 1) + card.h / 2 + 22)
  const at = (t, ph = 0) => [cx + RX * Math.sin(t + ph), y0 + ((t - Math.PI / 2) / Math.PI) * step]
  const line = (ph) => { const pts = [[cx, cy]]; for (let t = -0.2; t <= Math.PI / 2 + Math.PI * (n - 1) + 0.6; t += 0.05) pts.push(at(t, ph)); return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') }
  const nodes = Array.from({ length: n }, (_, i) => { const [sx, sy] = at(Math.PI / 2 + Math.PI * i); return { x: sx, y: sy, sx, sy } })
  return { path: line(0), path2: line(Math.PI), nodes, H, cx, cy }
}
