import { useEffect, useMemo, useState } from 'react'
import { callAgent, saveSettings, watchAgentRuns } from '../store.js'
import { AGENTS, AGENT } from '../../shared/constants.js'
import { fmtAgo, todayStr } from '../../shared/time.js'
import { Empty, Group } from '../ui.jsx'
import { AGENT_FACE, ENGINE, SCHEDULE } from '../org.js'

/* 에이전트 — 7개 에이전트가 오늘 한 일과 만든 결과 */
export default function Agents({ ctx }) {
  const [runs, setRuns] = useState([])
  const [status, setStatus] = useState(null)
  const [pick, setPick] = useState('all')
  useEffect(() => watchAgentRuns(setRuns, 80), [])
  useEffect(() => { callAgent('status').then(setStatus) }, [])
  const today = todayStr()
  const byAgent = useMemo(() => { const m = {}; runs.forEach((r) => { (m[r.agent] ||= []).push(r) }); return m }, [runs])
  const on = (k) => ctx.settings.agents?.[k]?.on !== false
  const toggle = async (k) => { await saveSettings({ [`agents.${k}.on`]: !on(k) }); ctx.say(`${AGENT[k].n} 에이전트를 ${on(k) ? '껐어요' : '켰어요'}`) }
  const shown = runs.filter((r) => pick === 'all' || r.agent === pick)

  return (
    <div className="stack">
      <div className="page-h"><h1 className="h">AI 팀</h1></div>
      <Connection status={status} />
      <div className="agents">
        {AGENTS.map((a) => {
          const list = byAgent[a.k] || []
          const todayN = list.filter((r) => r.at.slice(0, 10) === today || r.day === today).length
          return (
            <section key={a.k} className={`agent ${a.later ? 'is-later' : ''} ${!on(a.k) ? 'is-off' : ''}`} aria-pressed={pick === a.k}>
              <button type="button" className="agent-main" onClick={() => setPick(pick === a.k ? 'all' : a.k)}>
                <span className="agent-h"><span className="bot" aria-hidden="true">{AGENT_FACE[a.k]}</span><b>{a.n}</b><span className="muted small">{a.dept}</span></span>
                <span className="agent-d">{a.does}</span>
                <span className="agent-f">{SCHEDULE[a.k]}</span>
                <span className="agent-f muted">엔진: {ENGINE[a.k]}</span>
                {!a.later && <span className="agent-n"><b>{todayN}</b> 오늘 · 최근 {list[0] ? fmtAgo(list[0].at) : '기록 없음'}</span>}
              </button>
              {ctx.isAdmin && !a.later && (
                <label className="switch"><input type="checkbox" checked={on(a.k)} onChange={() => toggle(a.k)} /><span>{on(a.k) ? '켜짐' : '꺼짐'}</span></label>
              )}
            </section>
          )
        })}
      </div>

      <Group title={pick === 'all' ? '에이전트가 한 일' : `${AGENT[pick].n} 에이전트가 한 일`} count={shown.length} action={pick !== 'all' && <button type="button" className="link small" onClick={() => setPick('all')}>전체 보기</button>}>
        {shown.length ? (
          <div className="runs">
            {shown.map((r) => (
              <article key={r.id} className={`run ${r.status === 'fail' ? 'run-fail' : ''}`}>
                <div className="run-h"><b>{AGENT[r.agent]?.n || r.agent}</b><span>{r.title}</span><span className="muted small">{fmtAgo(r.at)}{r.engine && ` · ${r.engine}`}</span></div>
                {r.output && <div className="run-t">{r.output}</div>}
                {r.leadId && <button type="button" className="link small" onClick={() => ctx.openLead(r.leadId)}>고객 카드 열기</button>}
              </article>
            ))}
          </div>
        ) : <Empty title="아직 기록이 없어요">서버와 텔레그램이 연결되면 브리핑, 고객 카드 정리, 영수증 읽기, 미팅 준비 결과가 여기에 쌓여요.</Empty>}
      </Group>
    </div>
  )
}

function Connection({ status }) {
  if (!status) return <p className="muted small">연결 상태를 확인하는 중…</p>
  if (status.offline) return <p className="demo">{status.reason}</p>
  if (status.error) return <p className="err">{status.error}</p>
  const items = [
    ['Claude Haiku', status.claude], ['Gemini Flash-Lite', status.gemini], ['텔레그램 봇', status.telegram], ['예약 작업 (15분마다)', status.cronAt ? `마지막 ${fmtAgo(status.cronAt)}` : false],
  ]
  return (
    <div className="conn">
      {items.map(([n, v]) => <span key={n} className={v ? 'on' : 'off'}><i />{n}{typeof v === 'string' ? ` · ${v}` : v ? ' 연결됨' : ' 연결 전'}</span>)}
    </div>
  )
}
