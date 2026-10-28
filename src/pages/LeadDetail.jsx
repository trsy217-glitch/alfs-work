import { useEffect, useRef, useState } from 'react'
import { act, callAgent, watchLogs } from '../store.js'
import {
  AGENT, CALL_RESULTS, CALL_RESULT, CONTRACT, CONTRACT_STATUS, DUTIES, MEETING_NEXT, OWNER_OF_STAGE, OPEN_STAGES, ROLES, DEFAULT_REORDER_DAYS,
} from '../../shared/constants.js'
import { nextReorder } from '../../shared/work.js'
import { addDays, fmtAgo, fmtPhone, fmtWhen, nowLocal, telHref, todayStr, won } from '../../shared/time.js'
import { Chips, Icon, PersonPick, Sheet, StagePill, moneyInput, parseMoney, useSave } from '../ui.jsx'
import { LeadForm } from './Leads.jsx'

const LOG_LABEL = {
  create: '고객 등록', call: '통화', manage: '샵 관리', check: '완료 체크', book: '미팅 예약', ack: '예약 확인', meet: '미팅 결과', contract: '계약',
  note: '메모', assign: '담당 변경', stage: '단계 변경', order: '주문', prep: '다음 미팅 준비', tg: '텔레그램 메모',
}

export default function LeadDetail({ lead: l, ctx, onClose }) {
  const [logs, setLogs] = useState([])
  const [sheet, setSheet] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  useEffect(() => watchLogs(l.id, setLogs), [l.id])
  const seen = useRef(-1)
  useEffect(() => {
    if (seen.current >= 0 && logs.length > seen.current) endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    if (logs.length || seen.current >= 0) seen.current = logs.length
  }, [logs.length])
  useEffect(() => { const k = (e) => e.key === 'Escape' && !sheet && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [sheet, onClose])

  const uid = ctx.user.id
  const isOpen = OPEN_STAGES.includes(l.stage)
  const needAck = isOpen && l.appt && !l.apptAck && l.salesId === uid
  const run = async (fn, msg) => { setBusy(true); try { await fn(); ctx.say(msg); return true } catch { ctx.say('저장하지 못했어요. 다시 눌러 주세요.'); return false } finally { setBusy(false) } }
  const close = () => setSheet(null)

  return (
    <div className="detail" role="dialog" aria-label={l.name}>
      <header className="d-top">
        <button type="button" className="back" onClick={onClose} aria-label="닫기">‹</button>
        <div className="d-title"><b>{l.name}</b><StagePill l={l} /></div>
        <button type="button" className="link" onClick={() => setSheet('edit')}>수정</button>
      </header>

      <div className="d-body">
        <div className="d-cols">
          <div className="d-main">
            <div className="info">
              <div className="info-row"><span>원장·담당자</span><b>{l.person || '—'}</b></div>
              <div className="info-row"><span>전화</span>
                {l.phone ? <span className="phone"><a href={telHref(l.phone)} className="call-btn"><Icon k="phone" size={18} /> {fmtPhone(l.phone)}</a>
                  <button type="button" className="link small" onClick={() => navigator.clipboard?.writeText(l.phone).then(() => ctx.say('번호를 복사했어요'), () => {})}>복사</button></span> : <b>—</b>}
              </div>
              <div className="info-row"><span>지역·업종</span><b>{[l.region, l.category].filter(Boolean).join(' · ') || '—'}</b></div>
            </div>
            <div className="duties">
              {DUTIES.map((d) => (
                <div key={d.k} className={OWNER_OF_STAGE[l.stage] === d.k ? 'now' : ''}>
                  <span>{d.n}{OWNER_OF_STAGE[l.stage] === d.k && <em>지금</em>}</span>
                  <b>{l[d.k] ? ctx.nameOf(l[d.k]) : <span className="muted">미정</span>}</b>
                </div>
              ))}
            </div>

            <div className="status">
              {isOpen ? (
                <div className={l.appt ? (l.apptAck ? '' : 'hot') : 'off'}>
                  <span>미팅 예약</span><b>{l.appt?.at ? fmtWhen(l.appt.at) : '없음'}</b>
                  {l.appt?.place && <small>{l.appt.place}</small>}
                  {l.appt && <small>{l.apptAck ? '영업 확인 완료' : '영업 미확인'}</small>}
                </div>
              ) : l.stage === 'won' ? (
                <div className="hot-green"><span>다음 재발주 예상</span><b>{l.partner?.nextReorder ? fmtWhen(l.partner.nextReorder) : '—'}</b><small>주기 {l.partner?.cycleDays || DEFAULT_REORDER_DAYS}일 · 주문 {l.orders || 0}회</small></div>
              ) : null}
              <div><span>미팅 횟수</span><b>{l.meetings || 0}회</b><small>통화 {l.calls || 0}회</small></div>
              <div className={l.contract ? '' : 'off'}><span>계약</span><b>{l.contract ? CONTRACT[l.contract.status]?.n : '—'}</b>{l.contract?.amount ? <small>{won(l.contract.amount)}원</small> : null}</div>
              {isOpen && <div className={l.nextCall ? '' : 'off'}><span>다음 통화</span><b>{l.nextCall ? fmtWhen(l.nextCall) : '—'}</b></div>}
              <div className={l.nextManage ? '' : 'off'}><span>다음 관리</span><b>{l.nextManage ? fmtWhen(l.nextManage) : '—'}</b><small>관리 {l.manages || 0}회</small></div>
            </div>

            {needAck && (
              <button type="button" className="btn-primary ack" disabled={busy}
                onClick={() => run(async () => { await act(ctx.user, l, { type: 'ack', text: `${fmtWhen(l.appt.at)} 미팅 확인했습니다` }, { apptAck: true }); callAgent('notify', { kind: 'ack', leadId: l.id }) }, '예약을 확인했어요. TM에게 알렸어요')}>
                {fmtWhen(l.appt.at)} 미팅 확인했어요
              </button>
            )}

            {(isOpen || l.stage === 'won') && <MeetingPrep l={l} logs={logs} ctx={ctx} />}

            <div className="actions">
              {isOpen && <button type="button" onClick={() => setSheet('call')}><b>통화 기록</b><small>결과·다음 통화</small></button>}
              {isOpen && <button type="button" onClick={() => setSheet('book')}><b>미팅 예약</b><small>일시·영업 담당 → 알림</small></button>}
              {isOpen && <button type="button" onClick={() => setSheet('meet')}><b>미팅 결과</b><small>{(l.meetings || 0) + 1}번째 미팅 · 다음 단계</small></button>}
              <button type="button" onClick={() => setSheet('contract')}><b>계약 상황</b><small>협의·완료 → 파트너샵</small></button>
              {l.stage === 'won' && <button type="button" onClick={() => setSheet('order')}><b>주문 기록</b><small>재발주 예상일 자동 계산</small></button>}
              <button type="button" onClick={() => setSheet('manage')}><b>관리 기록</b><small>방문·교육·다음 관리</small></button>
            </div>
          </div>

          <div className="d-side">
            <h3 className="h3">기록과 대화</h3>
            <div className="timeline">
              {logs.length === 0 && <p className="muted small">아직 기록이 없어요.</p>}
              {logs.map((g) => <LogItem key={g.id} g={g} ctx={ctx} mine={g.by === uid} />)}
              <div ref={endRef} />
            </div>
          </div>
        </div>
      </div>

      <form className="composer" onSubmit={async (e) => {
        e.preventDefault(); const v = note.trim(); if (!v) return
        if (await run(() => act(ctx.user, l, { type: 'note', text: v }), '남겼어요')) setNote('')
      }}>
        <input id="note" className="inp" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="팀원에게 남길 말" aria-label="메모 남기기" />
        <button className="btn-send" disabled={busy || !note.trim()}>보내기</button>
      </form>

      {sheet === 'call' && <CallSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'book' && <BookSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'meet' && <MeetSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'contract' && <ContractSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'manage' && <ManageSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'order' && <OrderSheet l={l} ctx={ctx} onClose={close} />}
      {sheet === 'edit' && <LeadForm ctx={ctx} lead={l} onClose={close} onSaved={() => { close(); ctx.say('고쳤어요') }} onDeleted={() => { close(); onClose(); ctx.say('삭제했어요') }} />}
    </div>
  )
}

/* ── 다음 미팅 준비 (영업지원 에이전트) ── */
export function MeetingPrep({ l, logs, ctx, compact }) {
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState(null)
  const prep = l.prep?.text ? l.prep : local
  const make = async () => {
    setBusy(true)
    const r = await callAgent('prep', { leadId: l.id })
    setBusy(false)
    if (r.offline || r.error) {
      if (logs) setLocal({ text: prepFallback(l, logs), at: new Date().toISOString(), local: true })
      ctx.say(r.offline ? '에이전트 연결 전이라 기록에서 바로 정리했어요' : r.error)
    } else ctx.say('다음 미팅 준비 메모를 만들었어요')
  }
  if (compact) {
    return (
      <button type="button" className="prep prep-compact" onClick={() => ctx.openLead(l.id)}>
        <span className="prep-h"><b>{l.name}</b><span className="muted"> · {fmtWhen(l.appt.at)}{l.appt.place ? ` · ${l.appt.place}` : ''}</span></span>
        {prep ? <span className="prep-t">{prep.text.split('\n').filter(Boolean).slice(0, 3).join('\n')}</span>
          : <span className="muted small">아직 준비 메모가 없어요. 눌러서 열고 '준비 메모 만들기'를 눌러 주세요.</span>}
      </button>
    )
  }
  return (
    <section className="prep">
      <div className="prep-h"><Icon k="spark" /><b>{l.stage === 'won' ? '다음 방문 준비' : `다음 미팅 준비${l.appt?.at ? ` · ${fmtWhen(l.appt.at)}` : ''}`}</b>
        <span className="grow" />
        <button type="button" className="btn-mini" disabled={busy} onClick={make}>{busy ? '정리하는 중…' : prep ? '다시 만들기' : '준비 메모 만들기'}</button>
      </div>
      {prep ? (
        <>
          <div className="prep-t">{prep.text}</div>
          <p className="muted small">{prep.local ? '지난 기록에서 바로 정리 (AI 연결 전)' : `영업지원 에이전트 · ${fmtAgo(prep.at)}`}</p>
        </>
      ) : <p className="muted small">지난 통화·미팅 기록을 읽고 '지난번 이야기 · 다음 미팅에서 할 이야기 · 준비할 것'을 정리해 드려요. 미팅 결과를 저장하면 자동으로 만들어져요.</p>}
    </section>
  )
}
function prepFallback(l, logs) {
  const meets = logs.filter((g) => g.type === 'meet' || g.type === 'call' || g.type === 'note' || g.type === 'tg').slice(-3)
  const lines = ['지난번 이야기']
  meets.forEach((g) => lines.push(`- ${g.at.slice(5, 10).replace('-', '.')} ${LOG_LABEL[g.type]}: ${(g.text || '').slice(0, 80) || '(내용 없음)'}`))
  if (!meets.length) lines.push('- 아직 남긴 기록이 없어요')
  lines.push('', '준비할 것', '- 오륜미네랄 시음용 샘플과 컵', '- 제품 소개 자료 (원료·제조사 유디아미네랄·먹는 법)', `- 미팅 ${(l.meetings || 0) + 1}번째: 지난번 질문에 대한 답 정리`)
  return lines.join('\n')
}

function LogItem({ g, ctx, mine }) {
  const agent = g.agent && AGENT[g.agent]
  const role = agent ? null : ctx.roleOf(g.by)
  let head = LOG_LABEL[g.type] || '기록'
  let detail = ''
  if (g.type === 'call') { head = `통화 · ${CALL_RESULT[g.result]?.n || ''}`; if (g.nextCall) detail = `다음 통화 ${fmtWhen(g.nextCall)}` }
  if (g.type === 'book') detail = [fmtWhen(g.apptAt), g.place, g.salesId && `영업 ${ctx.nameOf(g.salesId)}`].filter(Boolean).join(' · ')
  if (g.type === 'manage') detail = g.nextManage ? `다음 관리 ${fmtWhen(g.nextManage)}` : ''
  if (g.type === 'check') head = `✓ ${g.text || '완료'}`
  if (g.type === 'meet') { head = `${g.count || ''}번째 미팅 결과`; detail = g.nextLabel ? `다음: ${g.nextLabel}${g.apptAt ? ` (${fmtWhen(g.apptAt)})` : ''}` : '' }
  if (g.type === 'contract') { head = `계약 · ${CONTRACT[g.status]?.n || ''}`; detail = [g.amount ? `${won(g.amount)}원` : '', g.date].filter(Boolean).join(' · ') }
  if (g.type === 'order') detail = [g.qty ? `${g.qty}병` : '', g.amount ? `${won(g.amount)}원` : '', g.nextReorder && `다음 예상 ${fmtWhen(g.nextReorder)}`].filter(Boolean).join(' · ')
  if (g.type === 'assign') detail = (g.changes || []).map((c) => `${c.n} ${c.id ? ctx.nameOf(c.id) : '미정'}`).join(' · ')
  const isNote = g.type === 'note'
  return (
    <div className={`log ${isNote ? 'log-note' : `log-${g.type}`} ${mine ? 'mine' : ''} ${agent ? 'log-agent' : ''}`}>
      <div className="log-h"><b>{agent ? `${agent.n} 에이전트` : ctx.nameOf(g.by)}</b>{role && <span className={`role role-${role}`}>{ROLES[role]?.short}</span>}{g.via === 'telegram' && <span className="via">텔레그램</span>}<span className="muted">{fmtAgo(g.at)}</span></div>
      {!isNote && g.type !== 'check' && <div className="log-type">{head}</div>}
      {g.type === 'check' && <div className="log-type">{head}</div>}
      {detail && <div className="log-d">{detail}</div>}
      {g.text && g.type !== 'check' && <div className="log-t">{g.text}</div>}
    </div>
  )
}

/* ── 입력 시트 ── */
function CallSheet({ l, ctx, onClose }) {
  const [result, setResult] = useState('talked')
  const [next, setNext] = useState('')
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const needNext = result === 'callback' || result === 'noanswer'
  return (
    <Sheet title="통화 기록" onClose={onClose} busy={busy} onSubmit={() => {
      if (needNext && !next) return setErr('다시 걸 날짜·시간을 정해 주세요.')
      const patch = { nextCall: needNext ? next : null }
      if (l.stage === 'new') patch.stage = 'called'
      if (result === 'reject') patch.stage = 'lost'
      save(() => act(ctx.user, l, { type: 'call', result, nextCall: needNext ? next : null, text: text.trim() }, patch, { calls: 1 }), '통화를 기록했어요')
    }}>
      <div className="field"><span>통화 결과</span><Chips items={CALL_RESULTS} value={result} onChange={setResult} /></div>
      {needNext && <label className="field"><span>다시 걸 때</span><input type="datetime-local" className="inp" value={next} min={nowLocal()} onChange={(e) => setNext(e.target.value)} /></label>}
      {result === 'reject' && <p className="hint">'관심 없음'을 저장하면 이 고객은 무산 단계로 옮겨져요.</p>}
      <label className="field"><span>통화 내용</span><textarea className="inp" rows={3} value={text} maxLength={800} onChange={(e) => setText(e.target.value)} placeholder="관심 있어 한 점, 물어본 것, 다음에 할 이야기" /></label>
      {result === 'talked' && <p className="hint">미팅이 잡혔다면 저장 후 '미팅 예약'을 눌러 영업에게 넘겨 주세요.</p>}
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function BookSheet({ l, ctx, onClose }) {
  const [at, setAt] = useState(l.appt?.at || '')
  const [place, setPlace] = useState(l.appt?.place || '매장 방문')
  const [sales, setSales] = useState(l.salesId || (ctx.me.role === 'sales' ? ctx.user.id : ''))
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  return (
    <Sheet title="미팅 예약" onClose={onClose} busy={busy} onSubmit={() => {
      if (!at) return setErr('미팅 날짜·시간을 정해 주세요.')
      if (!sales) return setErr('대면 미팅할 영업 담당을 골라 주세요.')
      const selfBooked = sales === ctx.user.id
      save(async () => {
        await act(ctx.user, l, { type: 'book', apptAt: at, place: place.trim(), salesId: sales, text: text.trim() },
          { appt: { at, place: place.trim(), reminded: false }, apptAck: selfBooked, salesId: sales, nextCall: null, stage: ['new', 'called', 'met', 'hold'].includes(l.stage) ? 'booked' : l.stage, prep: null })
        if (!selfBooked) callAgent('notify', { kind: 'booking', leadId: l.id })
      }, selfBooked ? '미팅을 예약했어요' : `미팅을 예약하고 ${ctx.nameOf(sales)}님에게 알렸어요`)
    }}>
      <label className="field"><span>미팅 일시</span><input type="datetime-local" className="inp" value={at} onChange={(e) => setAt(e.target.value)} /></label>
      <label className="field"><span>장소</span><input className="inp" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} /></label>
      <label className="field"><span>대면 미팅 담당 (영업)</span><PersonPick id="pickSales" ctx={ctx} role="sales" value={sales} onChange={setSales} /></label>
      <label className="field"><span>영업에게 전할 말</span><textarea className="inp" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="원장님 관심사, 통화에서 나온 이야기" /></label>
      <p className="hint">저장하면 영업 담당에게 텔레그램으로 '미팅 배정' 알림과 확인 버튼이 가고, 미팅 1시간 전에 준비 메모가 다시 갑니다.</p>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function MeetSheet({ l, ctx, onClose }) {
  const [next, setNext] = useState('again')
  const [again, setAgain] = useState('')
  const [text, setText] = useState('')
  const [todo, setTodo] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const count = (l.meetings || 0) + 1
  return (
    <Sheet title={`${count}번째 미팅 결과`} onClose={onClose} busy={busy} onSubmit={() => {
      if (!text.trim()) return setErr('미팅에서 나눈 이야기를 적어 주세요.')
      if (next === 'again' && !again) return setErr('다음 미팅 일시를 정해 주세요.')
      const label = MEETING_NEXT.find((o) => o.k === next).n
      const patch = next === 'again'
        ? { stage: 'met', appt: { at: again, place: l.appt?.place || '', reminded: false }, apptAck: l.salesId === ctx.user.id || !l.salesId, prep: null }
        : { stage: next, appt: null, apptAck: false, prep: null, ...(next === 'nego' && !l.contract ? { contract: { status: 'nego', amount: 0, date: '' } } : {}) }
      if (!l.salesId) patch.salesId = ctx.user.id
      const full = [text.trim(), todo.trim() && `다음에 할 것: ${todo.trim()}`].filter(Boolean).join('\n')
      save(async () => {
        await act(ctx.user, l, { type: 'meet', count, next, nextLabel: label, apptAt: next === 'again' ? again : null, text: full }, patch, { meetings: 1 })
        callAgent('after-meeting', { leadId: l.id })
      }, next === 'again' ? '저장했어요. 다음 미팅 준비 메모를 만들게요' : '미팅 결과를 남겼어요')
    }}>
      <label className="field"><span>미팅 내용</span><textarea className="inp" rows={4} value={text} maxLength={1200} onChange={(e) => setText(e.target.value)} placeholder="원장님 반응, 질문, 걱정하는 점, 매장 상황" /></label>
      <label className="field"><span>다음에 할 것·약속 (선택)</span><input className="inp" value={todo} maxLength={200} onChange={(e) => setTodo(e.target.value)} placeholder="예: 시음 샘플 2병, 진열대 사진 보내기" /></label>
      <div className="field"><span>다음 단계</span><Chips items={MEETING_NEXT} value={next} onChange={setNext} /></div>
      {next === 'again' && <label className="field"><span>다음 미팅 일시</span><input type="datetime-local" className="inp" value={again} onChange={(e) => setAgain(e.target.value)} /></label>}
      <p className="hint">저장하면 영업지원 에이전트가 이 기록을 읽고 다음 미팅에서 할 이야기와 준비할 것을 정리해 둡니다.</p>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function ContractSheet({ l, ctx, onClose }) {
  const [status, setStatus] = useState(l.contract?.status || 'nego')
  const [amount, setAmount] = useState(l.contract?.amount ? Number(l.contract.amount).toLocaleString('ko-KR') : '')
  const [date, setDate] = useState(l.contract?.date || todayStr())
  const [text, setText] = useState('')
  const [manager, setManager] = useState(l.managerId || '')
  const [cycle, setCycle] = useState(String(l.partner?.cycleDays || DEFAULT_REORDER_DAYS))
  const [firstCare, setFirstCare] = useState(l.nextManage || '')
  const { busy, err, save } = useSave(ctx, onClose)
  return (
    <Sheet title="계약 상황" onClose={onClose} busy={busy} onSubmit={() => {
      const amt = parseMoney(amount)
      const d = status === 'won' ? (date || todayStr()) : date
      const extra = status === 'won' ? {
        managerId: manager || null, nextManage: firstCare || null,
        partner: { since: d, cycleDays: Number(cycle) || DEFAULT_REORDER_DAYS, lastOrderAt: l.partner?.lastOrderAt || d, nextReorder: nextReorder({ since: d, lastOrderAt: l.partner?.lastOrderAt || d, cycleDays: Number(cycle) || DEFAULT_REORDER_DAYS }) },
      } : {}
      save(() => act(ctx.user, l, { type: 'contract', status, amount: amt, date: d, text: text.trim(), ...(status === 'won' ? { managerId: manager || null } : {}) },
        { contract: { status, amount: amt, date: d }, stage: status, ...extra, ...(status !== 'nego' ? { appt: null, nextCall: null } : {}) }), status === 'won' ? '계약 완료! 파트너샵으로 옮겼어요' : '계약 상황을 남겼어요')
    }}>
      <div className="field"><span>상태</span><Chips items={CONTRACT_STATUS} value={status} onChange={setStatus} /></div>
      <div className="row2">
        <label className="field"><span>첫 주문 금액 (선택)</span><input className="inp" inputMode="numeric" value={amount} placeholder="0" onChange={moneyInput(setAmount)} /></label>
        <label className="field"><span>계약일</span><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {status === 'won' && (
        <>
          <div className="row2">
            <label className="field"><span>파트너샵 관리 담당</span><PersonPick id="pickManager" ctx={ctx} role="manager" value={manager} onChange={setManager} /></label>
            <label className="field"><span>재발주 주기 (일)</span><input className="inp" inputMode="numeric" value={cycle} onChange={(e) => setCycle(e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
          </div>
          <label className="field"><span>첫 관리 방문</span><input type="datetime-local" className="inp" value={firstCare} onChange={(e) => setFirstCare(e.target.value)} /></label>
          <p className="hint">계약 완료로 저장하면 '예비샵'에서 '파트너샵'으로 바뀌고, 샵관리 에이전트가 재발주 때를 챙깁니다.</p>
        </>
      )}
      <label className="field"><span>내용</span><textarea className="inp" rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} /></label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function ManageSheet({ l, ctx, onClose }) {
  const [text, setText] = useState('')
  const [next, setNext] = useState('')
  const [manager, setManager] = useState(l.managerId || (ctx.me.role === 'manager' ? ctx.user.id : ''))
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  return (
    <Sheet title="관리 기록" onClose={onClose} busy={busy} onSubmit={() => {
      if (!text.trim()) return setErr('관리한 내용을 적어 주세요.')
      save(() => act(ctx.user, l, { type: 'manage', nextManage: next || null, text: text.trim() }, { nextManage: next || null, managerId: manager || null }, { manages: 1 }), '관리 기록을 남겼어요')
    }}>
      <label className="field"><span>관리 내용</span><textarea className="inp" rows={4} value={text} maxLength={800} onChange={(e) => setText(e.target.value)} placeholder="방문·교육·진열 점검·판매 상황" /></label>
      <div className="row2">
        <label className="field"><span>다음 관리 일정</span><input type="datetime-local" className="inp" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field"><span>관리 담당</span><PersonPick id="pickManager2" ctx={ctx} role="manager" value={manager} onChange={setManager} /></label>
      </div>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

export function OrderSheet({ l, ctx, onClose }) {
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [text, setText] = useState('')
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const cycle = l.partner?.cycleDays || DEFAULT_REORDER_DAYS
  const nr = addDays(date || todayStr(), cycle)
  return (
    <Sheet title={`${l.name} 주문 기록`} onClose={onClose} busy={busy} onSubmit={() => {
      if (!qty) return setErr('몇 병 주문했는지 적어 주세요.')
      save(() => act(ctx.user, l, { type: 'order', qty: Number(qty), amount: parseMoney(amount), date, nextReorder: nr, text: text.trim() },
        { 'partner.lastOrderAt': date, 'partner.nextReorder': nr, 'partner.cycleDays': cycle }, { orders: 1 }), `주문을 기록했어요. 다음 재발주 예상 ${fmtWhen(nr)}`)
    }}>
      <div className="row2">
        <label className="field"><span>수량 (병)</span><input className="inp" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <label className="field"><span>금액 (선택)</span><input className="inp" inputMode="numeric" value={amount} placeholder="0" onChange={moneyInput(setAmount)} /></label>
      </div>
      <label className="field"><span>주문일</span><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <p className="hint">다음 재발주 예상일: {fmtWhen(nr)} (주기 {cycle}일). 그날 아침 샵관리 담당에게 알림이 가요.</p>
      <label className="field"><span>메모</span><input className="inp" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}
