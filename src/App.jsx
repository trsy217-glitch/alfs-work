import { useEffect, useMemo, useRef, useState } from 'react'
import { AuthProvider, useAuth, inAppBrowser, openInExternalBrowser } from './auth.jsx'
import {
  demo, watchMyMember, watchMembers, requestJoin, claimInvite, watchLeads, watchEvents, watchActivity, watchExpenses, watchContents, watchSettings, watchAgentRuns,
} from './store.js'
import { ROLES, OPEN_STAGES, AGENT } from '../shared/constants.js'
import { TABS, DEPT, AGENT_FACE, agentState, deptPeople } from './org.js'
import Hq from './pages/Hq.jsx'
import InstallCard from './Install.jsx'
import { buildTasks, isMine } from '../shared/work.js'
import { todayStr } from '../shared/time.js'
import { ADMIN_EMAILS } from './config.js'
import Today from './pages/Today.jsx'
import Leads, { LeadForm } from './pages/Leads.jsx'
import LeadDetail from './pages/LeadDetail.jsx'
import Schedule from './pages/Schedule.jsx'
import Expenses from './pages/Expenses.jsx'
import Marketing from './pages/Marketing.jsx'
import Partners from './pages/Partners.jsx'
import Agents from './pages/Agents.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Team from './pages/Team.jsx'
import './styles.css'

export default function App() {
  return <AuthProvider><Root /></AuthProvider>
}

function Root() {
  const auth = useAuth()
  const [me, setMe] = useState(undefined)
  useEffect(() => { if (!auth.user) { setMe(undefined); return } return watchMyMember(auth.user, setMe) }, [auth.user])
  if (auth.loading || (auth.user && me === undefined)) return <Shell><p className="muted center pad">불러오는 중…</p></Shell>
  if (!auth.user) return <Gate auth={auth} />
  if (!me) return <Join user={auth.user} onOut={auth.signOut} />
  if (me.role === 'pending') return <Waiting me={me} onOut={auth.signOut} />
  return <Main user={auth.user} me={me} onOut={auth.signOut} />
}

const Shell = ({ children }) => <div className="app"><div className="wrap">{children}</div></div>
const Brand = () => <div className="brand">ALFS<small>워크</small></div>

function Gate({ auth }) {
  const inApp = inAppBrowser()
  const [msg, setMsg] = useState(auth.error || '')
  return (
    <div className="app"><div className="wrap gate">
      <Brand />
      <h1>사람은 현장에서,<br />정리는 에이전트가</h1>
      <p className="muted">알프스 팀 전용입니다. 고객 발굴부터 미팅·계약·파트너샵 관리, 비용 정산과 마케팅까지 한 앱에서 함께 봅니다. 회사에서 안내받은 Google 계정으로 로그인해 주세요.</p>
      {inApp ? (
        <div className="stack">
          <p>{inApp === 'kakao' ? '카카오톡' : '앱'} 안의 브라우저에서는 Google 로그인이 막혀 있어요. 크롬·사파리에서 열어 주세요.</p>
          {inApp === 'kakao' && <button type="button" className="btn-primary" onClick={openInExternalBrowser}>기본 브라우저로 열기</button>}
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={async () => { setMsg(''); const r = await auth.signInWithGoogle(); if (r.error) setMsg(r.error) }}>
          {auth.demo ? '체험 모드로 시작하기' : 'Google 계정으로 로그인'}
        </button>
      )}
      {msg && <p className="err">{msg}</p>}
      <InstallCard />
    </div></div>
  )
}

function Join({ user, onOut }) {
  const [checking, setChecking] = useState(true)
  useEffect(() => { let on = true; claimInvite(user).catch(() => false).finally(() => on && setChecking(false)); return () => { on = false } }, [user])
  const [name, setName] = useState(user.name || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isAdmin = ADMIN_EMAILS.includes(user.email)
  if (checking) return <Shell><p className="muted center pad">팀원 등록을 확인하는 중…</p></Shell>
  return (
    <div className="app"><form className="wrap gate" onSubmit={async (e) => {
      e.preventDefault(); if (!name.trim()) return setErr('이름을 적어 주세요.')
      setBusy(true); setErr('')
      try { await requestJoin(user, name, isAdmin ? 'admin' : 'pending') } catch { setErr('등록하지 못했어요. 잠시 후 다시 눌러 주세요.') } finally { setBusy(false) }
    }}>
      <Brand />
      <h1>처음 오셨네요</h1>
      <p className="muted">{isAdmin ? '대표 계정입니다. 이름을 적으면 바로 시작합니다.' : '아직 팀원으로 등록되지 않은 계정이에요. 이름을 적고 가입을 요청하면 대표가 역할을 정해 줍니다. 미리 등록을 부탁했다면 그때 알려 준 Google 계정으로 로그인했는지 확인해 주세요.'}</p>
      <label className="field"><span>이름</span><input id="joinName" className="inp" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn-primary" disabled={busy}>{isAdmin ? '시작하기' : '가입 요청'}</button>
      <p className="muted small">{user.email} · <button type="button" className="link" onClick={onOut}>다른 계정으로</button></p>
    </form></div>
  )
}

function Waiting({ me, onOut }) {
  return (
    <Shell><div className="gate">
      <Brand />
      <h1>{me.name}님, 승인을 기다리고 있어요</h1>
      <p className="muted">대표나 팀원이 '팀·설정'에서 역할을 정해 주면 바로 열립니다. 정해지면 이 화면이 저절로 바뀌어요.</p>
      <button type="button" className="link" onClick={onOut}>로그아웃</button>
    </div></Shell>
  )
}

/* ─────────────── 본 화면 ─────────────── */
const readTab = () => { const h = window.location.hash.slice(1); return TABS.some((n) => n.k === h) ? h : 'hq' }

function Main({ user, me, onOut }) {
  const [tab, setTab] = useState(readTab)
  const [leads, setLeads] = useState(null)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [activity, setActivity] = useState([])
  const [expenses, setExpenses] = useState([])
  const [contents, setContents] = useState([])
  const [runs, setRuns] = useState([])
  const [settings, setSettings] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(null)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const t = useRef(0)
  const screen = useRef(null)
  const tabsRef = useRef(null)
  const say = (m) => { setToast(m); clearTimeout(t.current); t.current = setTimeout(() => setToast(''), 2400) }
  const isAdmin = me.role === 'admin'

  useEffect(() => watchLeads(setLeads, () => setErr('고객 목록을 불러오지 못했어요. 승인된 계정인지, Firestore 규칙이 게시됐는지 확인해 주세요.')), [])
  useEffect(() => watchMembers(setMembers), [])
  useEffect(() => watchEvents(setEvents), [])
  useEffect(() => watchActivity(setActivity), [])
  useEffect(() => watchExpenses(isAdmin ? null : user.id, setExpenses), [isAdmin, user.id])
  useEffect(() => watchContents(setContents), [])
  useEffect(() => watchAgentRuns(setRuns, 40), [])
  useEffect(() => watchSettings(setSettings), [])
  useEffect(() => { const f = () => { setTab(readTab()); setOpenId(null) }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  useEffect(() => { screen.current?.scrollTo(0, 0); tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])
  const go = (k) => { setOpenId(null); if (window.location.hash !== `#${k}`) window.location.hash = k; setTab(k) }

  const ctx = useMemo(() => {
    const map = Object.fromEntries(members.map((m) => [m.id, m]))
    map[user.id] = { ...(map[user.id] || {}), ...me }
    return {
      user, me, members, say, go, isAdmin, settings: settings || { approvalLimit: 20000, agents: {} },
      nameOf: (id) => (id ? map[id]?.name || '팀원' : ''),
      roleOf: (id) => map[id]?.role,
      people: members.filter((m) => m.role !== 'pending'),
      openLead: setOpenId,
      addLead: (preset = {}) => setAdding(preset),
      data: { leads: leads || [], events, activity, expenses, contents, members },
    }
  }, [members, me, user, leads, events, activity, expenses, contents, settings, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = leads?.find((l) => l.id === openId)
  const today = todayStr()
  const badges = useMemo(() => {
    const tasks = buildTasks(leads || [], events)
    const mine = tasks.filter((x) => isMine(x, user.id) && x.day <= today && !x.done).length
    const ack = (leads || []).filter((l) => OPEN_STAGES.includes(l.stage) && l.appt && !l.apptAck && l.salesId === user.id).length
    return {
      ceo: mine + ack + (isAdmin ? expenses.filter((e) => e.status === 'pending').length : 0),
      finance: isAdmin ? expenses.filter((e) => e.status === 'pending').length : 0,
      marketing: isAdmin ? contents.filter((c) => c.status === 'review').length : 0,
      team: members.filter((m) => m.role === 'pending').length,
    }
  }, [leads, events, expenses, contents, members, user.id, today, isAdmin])

  const cur = TABS.find((x) => x.k === tab)
  const dept = DEPT[tab]
  const page = leads === null ? <p className="muted center pad">불러오는 중…</p>
    : tab === 'hq' ? <Hq ctx={ctx} runs={runs} />
      : tab === 'ceo' ? <CeoRoom ctx={ctx} />
        : tab === 'scout' ? <Leads ctx={ctx} preset="scout" key="scout" />
          : tab === 'sales' ? <Leads ctx={ctx} preset="sales" key="sales" />
            : tab === 'partners' ? <Partners ctx={ctx} />
              : tab === 'finance' ? <Expenses ctx={ctx} />
                : tab === 'marketing' ? <Marketing ctx={ctx} />
                  : tab === 'schedule' ? <Schedule ctx={ctx} />
                    : tab === 'agents' ? <Agents ctx={ctx} />
                      : <Team ctx={ctx} onOut={onOut} />

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-row">
          {tab !== 'hq'
            ? <button type="button" className="hdr-back" onClick={() => (openId ? setOpenId(null) : go('hq'))} aria-label={openId ? '목록으로' : '본사로'}>‹</button>
            : <span className="hdr-mark" aria-hidden="true">◎</span>}
          <div className="hdr-crumb">
            <button type="button" className="brand" onClick={() => go('hq')}>ALFS<small>워크</small></button>
            {tab !== 'hq' && <><span className="sep">/</span><b>{dept?.n || cur?.n}</b></>}
            {open && <><span className="sep">/</span><span className="crumb-lead">{open.name}</span></>}
          </div>
          <div className="me"><span className={`role role-${me.role}`}>{ROLES[me.role]?.short}</span><span className="me-n">{me.name}</span></div>
        </div>
        <nav className="hdr-tabs" ref={tabsRef} aria-label="메뉴">
          {TABS.map((n) => (
            <button type="button" key={n.k} aria-current={tab === n.k ? 'page' : undefined} onClick={() => go(n.k)}>
              {n.n}{badges[n.k] > 0 && <i className="badge">{badges[n.k]}</i>}
            </button>
          ))}
        </nav>
      </header>

      <main className="screen" ref={screen}>
        <div className={`screen-in ${tab === 'hq' ? 'is-hq' : ''}`}>
          {demo && tab === 'hq' && <p className="demo">{import.meta.env.VITE_PREVIEW_SEED ? '미리보기 · 고객·비용·일정은 예시 데이터예요. 고치면 이 브라우저에만 저장되고, AI 에이전트·텔레그램은 실제 연결 후 동작해요.' : '체험 모드 · 이 브라우저에만 저장되고 AI 에이전트·텔레그램은 꺼져 있어요.'}</p>}
          {tab === 'hq' && <InstallCard compact dismissible />}
          {err && <p className="err">{err}</p>}
          {dept && <DeptBar d={dept} ctx={ctx} runs={runs} />}
          {page}
        </div>
      </main>

      {open && <LeadDetail lead={open} ctx={ctx} onClose={() => setOpenId(null)} />}
      {adding && <LeadForm ctx={ctx} preset={adding} onClose={() => setAdding(null)} onSaved={(id) => { setAdding(null); setOpenId(id); say('고객을 등록했어요') }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

/* 부서 머리줄 — 부서 이름·담당자·에이전트 상태 */
function DeptBar({ d, ctx, runs }) {
  const s = agentState(d.agent, { settings: ctx.settings, runs, leads: ctx.data.leads })
  const ppl = deptPeople(d, ctx.people)
  return (
    <section className="deptbar">
      <div className="deptbar-t"><h1>{d.n}</h1><span className="muted">{d.sub}</span></div>
      <div className="deptbar-m">
        <span className="deptbar-people">{ppl.length ? ppl.map((m) => <span key={m.id} className="person-chip"><span className="ava">{m.name.slice(-2)}</span>{m.name}{m.title && <small>{m.title}</small>}{m.freelance && <small className="fl">프리랜서</small>}</span>) : <span className="muted small">담당자 미정 · 설정에서 역할을 정해 주세요</span>}</span>
        <button type="button" className={`agent-chip st-${s.st}`} onClick={() => ctx.go('agents')}>
          <em aria-hidden="true">{AGENT_FACE[d.agent]}</em><b>{AGENT[d.agent].n} 에이전트</b><span>{s.st === 'working' ? '작업 중' : s.st === 'off' ? '꺼짐' : '대기 중'} · {s.line}</span>
        </button>
      </div>
    </section>
  )
}

/* 대표실 — 오늘 / 경영 현황 */
function CeoRoom({ ctx }) {
  const [v, setV] = useState('today')
  return (
    <>
      {ctx.isAdmin && (
        <div className="seg seg-sm subnav">
          <button type="button" aria-pressed={v === 'today'} onClick={() => setV('today')}>오늘</button>
          <button type="button" aria-pressed={v === 'dash'} onClick={() => setV('dash')}>경영 현황</button>
        </div>
      )}
      {v === 'dash' && ctx.isAdmin ? <Dashboard ctx={ctx} /> : <Today ctx={ctx} />}
    </>
  )
}
