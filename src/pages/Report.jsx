import { useEffect, useState } from 'react'
import { addDays, dayLabel, todayStr, won } from '../../shared/time.js'
import { mondayOf, weekKey, weekRange, weeklyCustomerReport, KIND } from '../../shared/report.js'
import { loadActivityRange, callAgent } from '../store.js'
import { Chips, Empty, Group } from '../ui.jsx'

/* 리포트 — 주간 고객 발굴·통화·미팅 예약·미팅·계약 결과, 구글 시트로 모으기 */
export default function Report({ ctx }) {
  const { leads, members } = ctx.data
  const thisMon = mondayOf(todayStr())
  const [mon, setMon] = useState(thisMon)
  const [acts, setActs] = useState(null)
  const [kind, setKind] = useState('all')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let on = true
    setActs(null); setMsg(null)
    const { startIso, endIso } = weekRange(mon)
    loadActivityRange(startIso, endIso).then((a) => on && setActs(a)).catch(() => on && setActs([]))
    return () => { on = false }
  }, [mon])

  const r = acts ? weeklyCustomerReport({ leads, members, activity: acts }, mon) : null
  const s = r?.summary
  const rows = r ? (kind === 'all' ? r.rows : r.rows.filter((x) => x.type === kind)) : []
  const funnel = s ? [
    { k: '발굴', v: s.scouted, note: '새로 등록한 고객' },
    { k: '통화', v: s.calls, note: `연결 ${s.talked}` },
    { k: '미팅 예약', v: s.booked },
    { k: '미팅', v: s.met },
    { k: '계약', v: s.won, note: s.amount ? `${won(s.amount)}원` : '' },
  ] : []
  const fmax = Math.max(1, ...funnel.map((f) => f.v))

  const send = async () => {
    setBusy(true); setMsg(null)
    const res = await callAgent('weekSheet', { week: mon })
    setBusy(false)
    if (res.ok) { setMsg({ ok: true, t: `구글 시트에 보냈어요 · ${s.label} · 기록 ${res.rows}줄` }); ctx.say('구글 시트에 보냈어요') }
    else setMsg({ ok: false, t: res.reason || res.error || '보내지 못했어요.' })
  }

  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">주간 고객 리포트</h1>
        <div className="weeknav">
          <button type="button" onClick={() => setMon(addDays(mon, -7))} aria-label="지난주">‹</button>
          <b className="num">{dayLabel(mon)} ~ {dayLabel(addDays(mon, 6))}</b>
          <button type="button" onClick={() => setMon(addDays(mon, 7))} disabled={mon >= thisMon} aria-label="다음 주">›</button>
          {mon !== thisMon && <button type="button" className="link" onClick={() => setMon(thisMon)}>이번 주</button>}
        </div>
      </div>

      {!r ? <p className="muted center pad">불러오는 중…</p> : (
        <>
          <div className="kpis kpis-5">
            {funnel.map((f) => <div key={f.k}><b>{f.v}</b>{f.k}{f.note ? <small> · {f.note}</small> : null}</div>)}
          </div>

          {ctx.isAdmin && (
            <Group title="구글 시트로 모으기" note={`${weekKey(mon)} · 매주 월요일 아침에 지난주 리포트가 자동으로 들어가요. 지금 보내도 되고, 같은 주를 다시 보내면 그 주 줄만 새로 바뀝니다.`}>
              <div>
                <button type="button" className="btn-primary" onClick={send} disabled={busy}>{busy ? '보내는 중…' : '이 주 리포트를 구글 시트로 보내기'}</button>
              </div>
              {msg && <p className={msg.ok ? 'report-ok' : 'err'} role="status">{msg.t}</p>}
            </Group>
          )}

          <div className="dash-2">
            <Group title="이번 주 흐름" note="이 주에 남긴 기록 수예요.">
              <div className="funnel">
                {funnel.map((f, i) => (
                  <div key={f.k} className="fun-row">
                    <span>{f.k}</span>
                    <i style={{ width: `${Math.max(2, (f.v / fmax) * 100)}%` }} />
                    <b>{f.v}</b>
                    <small>{i > 1 && funnel[i - 1].v ? `${Math.round((f.v / funnel[i - 1].v) * 100)}%` : ''}</small>
                  </div>
                ))}
              </div>
              <p className="muted small">무산 {s.lost}건 · 움직인 고객 {s.customers}곳</p>
            </Group>
            <Group title="담당자별">
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>이름</th><th>발굴</th><th>통화</th><th>예약</th><th>미팅</th><th>계약</th></tr></thead>
                  <tbody>
                    {r.people.map((p) => (
                      <tr key={p.id}><td><b>{p.name}</b> <small className="muted">{p.role}</small></td><td>{p.scouted}</td><td>{p.calls}</td><td>{p.booked}</td><td>{p.met}</td><td>{p.won}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Group>
          </div>

          <Group title="고객 기록" count={rows.length}>
            <Chips scroll value={kind} onChange={setKind} items={[{ k: 'all', n: '전체', c: r.rows.length }, ...Object.entries(KIND).map(([k, n]) => ({ k, n, c: r.rows.filter((x) => x.type === k).length }))]} />
            {rows.length ? (
              <div className="table-wrap">
                <table className="tbl tbl-report">
                  <thead><tr><th>일시</th><th>구분</th><th>고객</th><th>담당</th><th>결과</th><th>메모</th></tr></thead>
                  <tbody>
                    {rows.map((x, i) => (
                      <tr key={i}>
                        <td className="num nowrap">{x.at.slice(5).replace('-', '.')}</td>
                        <td className="nowrap">{x.kind}</td>
                        <td>{x.leadId && leads.some((l) => l.id === x.leadId) ? <button type="button" className="link" onClick={() => ctx.openLead(x.leadId)}>{x.lead}</button> : x.lead}{x.region && <small className="muted"> · {x.region}</small>}</td>
                        <td className="nowrap">{x.person}</td>
                        <td>{x.result}{x.amount ? <small> · {won(x.amount)}원</small> : null}</td>
                        <td className="muted small">{x.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="이 주에 남긴 기록이 없어요" />}
          </Group>
        </>
      )}
    </div>
  )
}
