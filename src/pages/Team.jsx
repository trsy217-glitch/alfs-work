import { useEffect, useState } from 'react'
import { addInvite, callAgent, demo, importOldExpenses, removeInvite, removeMember, saveSettings, setMember, watchInvites } from '../store.js'
import { ROLES, ROLE_PICK } from '../../shared/constants.js'
import { won } from '../../shared/time.js'
import { Chips, Group, moneyInput, parseMoney } from '../ui.jsx'
import InstallCard from '../Install.jsx'

const BOT = import.meta.env.VITE_TELEGRAM_BOT || ''

/* 팀·설정 — 팀원·역할, 내 텔레그램 연결, (대표) 회사 설정 */
export default function Team({ ctx, onOut }) {
  return (
    <div className="stack">
      <div className="page-h"><h1 className="h">팀·설정</h1></div>
      <InstallCard />
      <Telegram ctx={ctx} />
      <Members ctx={ctx} />
      {ctx.isAdmin && <CompanySettings ctx={ctx} />}
      <p className="muted small center foot">{ctx.user.email} · <button type="button" className="link" onClick={onOut}>로그아웃</button></p>
    </div>
  )
}

function Telegram({ ctx }) {
  const { me, user } = ctx
  const [code, setCode] = useState(me.tgCode || '')
  const make = async () => {
    const c = String(Math.floor(100000 + Math.random() * 900000))
    await setMember(user.id, { tgCode: c, tgCodeAt: new Date().toISOString() })
    setCode(c)
  }
  const link = BOT && code ? `https://t.me/${BOT}?start=${code}` : ''
  return (
    <Group title="내 텔레그램" note="연결하면 아침 브리핑·미팅 알림·승인 요청을 텔레그램으로 받고, 통화 메모·음성·영수증 사진을 봇에게 보내면 에이전트가 앱에 정리해 넣어요.">
      <div className="panel-box">
        {me.tgChatId ? (
          <>
            <p><b>연결됨</b> · 알림을 텔레그램으로 받고 있어요.</p>
            <div className="btn-row">
              <button type="button" className="btn-ghost" onClick={async () => { const r = await callAgent('notify', { kind: 'test' }); ctx.say(r.ok ? '테스트 메시지를 보냈어요' : r.reason || r.error || '보내지 못했어요') }}>테스트 메시지 받기</button>
              <button type="button" className="link danger small" onClick={async () => { await setMember(user.id, { tgChatId: null, tgCode: null }); ctx.say('연결을 끊었어요') }}>연결 끊기</button>
            </div>
          </>
        ) : (
          <>
            <ol className="steps">
              <li>휴대폰에 텔레그램 앱을 설치하고 가입해요.</li>
              <li>아래 '연결 코드 만들기'를 눌러요.</li>
              <li>{BOT ? <>'텔레그램에서 열기'를 누르고 <b>시작</b>을 눌러요.</> : <>봇에게 <b>/start 코드</b>를 보내요.</>}</li>
            </ol>
            {code ? (
              <div className="tgcode">
                <span>연결 코드</span><b className="num">{code}</b>
                {link ? <a className="btn-primary" href={link} target="_blank" rel="noreferrer">텔레그램에서 열기</a> : <p className="muted small">봇 주소가 아직 설정되지 않았어요 (VITE_TELEGRAM_BOT). 봇에게 '/start {code}'를 보내 주세요.</p>}
              </div>
            ) : <button type="button" className="btn-primary" onClick={make}>연결 코드 만들기</button>}
            {demo && <p className="muted small">체험 모드에서는 실제로 연결되지 않아요.</p>}
          </>
        )}
      </div>
    </Group>
  )
}

function Members({ ctx }) {
  const [invites, setInvites] = useState([])
  const [f, setF] = useState({ name: '', email: '', role: 'tm', title: '', freelance: true })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState('')
  useEffect(() => watchInvites(setInvites), [])
  const pending = ctx.members.filter((m) => m.role === 'pending')
  const active = ctx.members.filter((m) => m.role !== 'pending').sort((a, b) => ROLE_PICK.indexOf(a.role) - ROLE_PICK.indexOf(b.role))
  const change = async (m, r) => { try { await setMember(m.id, { role: r }); ctx.say(`${m.name}님을 ${ROLES[r].short}(으)로 정했어요`) } catch { ctx.say('바꾸지 못했어요') } }
  const remove = async (m) => { if (sure !== m.id) return setSure(m.id); try { await removeMember(m.id); ctx.say('팀에서 뺐어요') } catch { ctx.say('빼지 못했어요') } }
  const add = async (e) => {
    e.preventDefault()
    const email = f.email.trim().toLowerCase()
    if (!f.name.trim()) return setErr('이름을 적어 주세요.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('Google 계정 이메일을 정확히 적어 주세요.')
    if (ctx.members.some((m) => (m.email || '').toLowerCase() === email && m.role !== 'pending')) return setErr('이미 팀원으로 등록된 이메일이에요.')
    const waiting = ctx.members.find((m) => (m.email || '').toLowerCase() === email && m.role === 'pending')
    setBusy(true); setErr('')
    try {
      if (waiting) await setMember(waiting.id, { role: f.role, name: f.name.trim(), title: f.title.trim(), freelance: f.freelance })
      else await addInvite(ctx.user.id, { ...f, email })
      ctx.say(`${f.name.trim()}님을 ${ROLES[f.role].short}(으)로 등록했어요`)
      setF({ name: '', email: '', role: f.role, title: '', freelance: f.freelance })
    } catch { setErr('등록하지 못했어요. 다시 눌러 주세요.') } finally { setBusy(false) }
  }
  return (
    <>
      <Group title="팀원 등록">
        <form className="panel-box" onSubmit={add} noValidate>
          <p className="muted small">이름·Google 이메일·역할을 적어 두면 그 사람이 로그인할 때 바로 들어옵니다.</p>
          <div className="row2">
            <label className="field"><span>이름</span><input id="mName" className="inp" value={f.name} maxLength={20} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="예: 황은경" /></label>
            <label className="field"><span>Google 이메일</span><input id="mEmail" className="inp" type="email" inputMode="email" autoCapitalize="off" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} /></label>
          </div>
          <div className="field"><span>역할 (앱에서 하는 일)</span><Chips items={ROLE_PICK.map((r) => ({ k: r, n: ROLES[r].n }))} value={f.role} onChange={(r) => setF((s) => ({ ...s, role: r }))} /></div>
          <div className="row2">
            <label className="field"><span>직함</span><input id="mTitle" className="inp" value={f.title} maxLength={20} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="예: 영업이사, 영업과장, TM" /></label>
            <label className="check"><input type="checkbox" checked={f.freelance} onChange={(e) => setF((s) => ({ ...s, freelance: e.target.checked }))} /> 프리랜서</label>
          </div>
          {err && <p className="err">{err}</p>}
          <button className="btn-primary" disabled={busy}>{busy ? '등록하는 중…' : '등록'}</button>
        </form>
      </Group>

      {pending.length > 0 && (
        <Group title="역할을 기다리는 사람" tone="alert" count={pending.length} note="로그인해서 가입을 요청한 사람이에요. 역할을 누르면 바로 쓸 수 있어요.">
          <div className="list">{pending.map((m) => <MemberRow key={m.id} m={m} ctx={ctx} onRole={change} onRemove={remove} sure={sure} />)}</div>
        </Group>
      )}
      {invites.length > 0 && (
        <Group title="등록해 두고 아직 로그인 전" count={invites.length}>
          <div className="list">
            {invites.map((v) => (
              <div className="member" key={v.email}>
                <div><b>{v.name}</b> <span className={`role role-${v.role}`}>{ROLES[v.role]?.short}</span>{v.title && <span className="title-tag">{v.title}</span>}<span className="muted small"> {v.email}</span></div>
                <div className="seg">{ROLE_PICK.map((r) => <button type="button" key={r} aria-pressed={v.role === r} onClick={async () => { await addInvite(v.by || ctx.user.id, { email: v.email, name: v.name, role: r, title: v.title, freelance: v.freelance }); ctx.say('역할을 바꿨어요') }}>{ROLES[r].short}</button>)}</div>
                <button type="button" className="link danger small" onClick={async () => { if (sure !== v.email) return setSure(v.email); await removeInvite(v.email); ctx.say('등록을 취소했어요') }}>{sure === v.email ? '한 번 더 누르면 취소돼요' : '등록 취소'}</button>
              </div>
            ))}
          </div>
        </Group>
      )}
      <Group title="함께 쓰는 팀원" count={active.length}>
        <div className="list">{active.map((m) => <MemberRow key={m.id} m={m} ctx={ctx} onRole={change} onRemove={remove} sure={sure} />)}</div>
      </Group>
    </>
  )
}
function MemberRow({ m, ctx, onRole, onRemove, sure }) {
  const self = m.id === ctx.user.id
  return (
    <div className="member">
      <div><b>{m.name}</b>{m.title && <span className="title-tag">{m.title}</span>}{m.freelance && <span className="title-tag fl">프리랜서</span>}{self && <span className="muted small"> (나)</span>}<span className="muted small"> {m.email}</span>{m.tgChatId && <span className="via">텔레그램</span>}</div>
      <div className="row-inline">
        <input className="inp inp-sm" aria-label={`${m.name} 직함`} defaultValue={m.title || ''} maxLength={20} placeholder="직함" onBlur={async (e) => { const v = e.target.value.trim(); if (v !== (m.title || '')) { await setMember(m.id, { title: v }); ctx.say('직함을 바꿨어요') } }} />
        <label className="check small"><input type="checkbox" defaultChecked={!!m.freelance} onChange={async (e) => { await setMember(m.id, { freelance: e.target.checked }); ctx.say('바꿨어요') }} /> 프리랜서</label>
      </div>
      <div className="seg">{ROLE_PICK.map((r) => <button type="button" key={r} aria-pressed={m.role === r} disabled={self} onClick={() => onRole(m, r)}>{ROLES[r].short}</button>)}</div>
      {!self && <button type="button" className="link danger small" onClick={() => onRemove(m)}>{sure === m.id ? '한 번 더 누르면 팀에서 빠져요' : '팀에서 빼기'}</button>}
    </div>
  )
}

function CompanySettings({ ctx }) {
  const s = ctx.settings
  const [limit, setLimit] = useState(Number(s.approvalLimit).toLocaleString('ko-KR'))
  const [time, setTime] = useState(s.briefingTime || '08:30')
  const [busy, setBusy] = useState(false)
  return (
    <Group title="회사 설정 (대표)">
      <div className="panel-box">
        <div className="row2">
          <label className="field"><span>대표 승인이 필요한 비용</span><div className="amount amount-sm"><input className="num" inputMode="numeric" value={limit} onChange={moneyInput(setLimit)} /><b>원 이상</b></div></label>
          <label className="field"><span>아침 브리핑 시각 (평일)</span><input type="time" className="inp" value={time} step={900} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <p className="muted small">예약 작업이 15분마다 돌아서 브리핑은 정한 시각부터 15분 안에 도착해요.</p>
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
          const v = parseMoney(limit); if (!v) return ctx.say('금액을 적어 주세요')
          setBusy(true); try { await saveSettings({ approvalLimit: v, briefingTime: time }); ctx.say(`${won(v)}원 이상은 승인, 브리핑 ${time}로 저장했어요`) } finally { setBusy(false) }
        }}>설정 저장</button>
      </div>
      <div className="panel-box">
        <b>이전 '일괄 정산 앱' 비용 가져오기</b>
        <p className="muted small">같은 Firebase 프로젝트에 있던 영수증·비용을 이 앱으로 복사해요. 여러 번 눌러도 같은 건은 한 번만 옮겨요.</p>
        <button type="button" className="btn-ghost" disabled={busy} onClick={async () => {
          setBusy(true)
          try { const r = await importOldExpenses(); ctx.say(`${r.moved}건 옮겼어요${r.skipped ? ` · ${r.skipped}건은 이미 있어요` : ''}`) } catch { ctx.say('가져오지 못했어요. 규칙(firestore.rules)이 게시됐는지 확인해 주세요') } finally { setBusy(false) }
        }}>가져오기</button>
      </div>
    </Group>
  )
}
