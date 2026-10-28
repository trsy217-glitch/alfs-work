import { useEffect, useRef, useState } from 'react'
import { addExpense, callAgent, getReceipt, readReceipt, removeExpense, setExpenseStatus } from '../store.js'
import { EXP_CATS, EXP_CAT, EXP_STATUS } from '../../shared/constants.js'
import { shiftMonth, todayStr, won } from '../../shared/time.js'
import { Chips, Empty, Group, Icon, Sheet, moneyInput, parseMoney } from '../ui.jsx'

const CAT_COLOR = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)', 'var(--c9)', 'var(--c10)']

function sums(items) {
  const s = { total: 0, pending: 0, approved: 0, paid: 0, toPay: 0 }
  for (const it of items) {
    if (it.status === 'rejected') continue
    s.total += it.amount
    if (it.status === 'pending') s.pending += it.amount
    if (it.status === 'approved') { s.approved += it.amount; if (it.pay !== 'company') s.toPay += it.amount }
    if (it.status === 'paid') s.paid += it.amount
  }
  return s
}

// 사진을 1280px·JPEG 로 줄여 190KB 안팎으로 (Firestore 문서 1건에 들어가는 크기)
async function compress(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    let max = 1280, q = 0.72, out = ''
    for (let k = 0; k < 6; k++) {
      const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc)
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height)
      out = c.toDataURL('image/jpeg', q)
      if (out.length < 190000) break
      max = Math.round(max * 0.82); q = Math.max(0.45, q - 0.07)
    }
    return out
  } finally { URL.revokeObjectURL(url) }
}

/* 비용 — 영수증 찍어 올리기, 2만원 이상은 대표 승인 */
export default function Expenses({ ctx }) {
  const { user, isAdmin, data } = ctx
  const limit = ctx.settings.approvalLimit
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [tab, setTab] = useState(isAdmin ? 'all' : 'mine')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(null)
  const [viewing, setViewing] = useState(null)
  const inMonth = (list) => list.filter((i) => i.month === month).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const mine = inMonth(data.expenses.filter((e) => e.uid === user.id))
  const all = inMonth(data.expenses)
  const list = tab === 'all' ? all : mine
  const shown = cat === 'all' ? list : list.filter((i) => i.category === cat)
  const waiting = all.filter((e) => e.status === 'pending')
  const [y, m] = month.split('-')

  async function bulk(from, to, label) {
    const items = all.filter((i) => i.status === from)
    if (!items.length) return ctx.say(`${EXP_STATUS[from]} 건이 없어요`)
    let n = 0
    for (const it of items) { try { await setExpenseStatus(user, it, to); n++ } catch { /* 다음 건 계속 */ } }
    ctx.say(`${n}건 ${label}`)
  }
  function downloadCsv() {
    const rows = [...all].reverse()
    if (!rows.length) return ctx.say('이 달 내역이 없어요')
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
    const lines = [['날짜', '담당', '항목', '금액', '결제', '메모', '상태', '영수증', '올린 곳'].map(esc).join(',')]
    rows.forEach((i) => lines.push([i.date, ctx.nameOf(i.uid), (EXP_CAT[i.category] || EXP_CAT.etc).n, i.amount, i.pay === 'company' ? '회사카드' : '개인 결제', i.memo, EXP_STATUS[i.status], i.hasReceipt ? '있음' : '없음', i.via === 'telegram' ? '텔레그램' : '앱'].map(esc).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `알프스_비용정산_${month}.csv`
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const s = sums(list)
  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">비용</h1>
        <div className="weeknav" aria-label="정산 월">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
          <b className="num">{y}.{m}</b>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
        </div>
      </div>
      {isAdmin && (
        <div className="seg seg-2">
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => { setTab('mine'); setCat('all') }}>내 비용</button>
          <button type="button" aria-pressed={tab === 'all'} onClick={() => { setTab('all'); setCat('all') }}>전체 정산{waiting.length > 0 && <i className="badge">{waiting.length}</i>}</button>
        </div>
      )}
      <div className="sum">
        <div className="sum-l">{Number(m)}월 {tab === 'all' ? '전체 비용 (반려 제외)' : '내 비용'}</div>
        <div className="sum-t num">{won(s.total)}<small>원</small></div>
        <div className="sum-split">{[['승인 대기', 'pending'], [tab === 'all' ? '지급할 금액' : '승인', tab === 'all' ? 'toPay' : 'approved'], ['지급 완료', 'paid']].map(([n, k]) => <div key={k}>{n}<b className="num">{won(s[k])}</b></div>)}</div>
      </div>
      <p className="muted small">{won(limit)}원 미만은 바로 승인되고, {won(limit)}원 이상은 대표 승인 후 지급돼요. 텔레그램 봇에 영수증 사진을 보내도 정산 에이전트가 읽어서 올려 줍니다.</p>

      {tab === 'all' && (
        <>
          {waiting.length > 0 && (
            <Group title="승인 대기" tone="alert" count={waiting.length}>
              <div className="list">{waiting.map((it) => <Row key={it.id} it={it} who={ctx.nameOf(it.uid)} onOpen={() => setViewing(it)} />)}</div>
              <button type="button" className="btn-ghost" onClick={() => bulk('pending', 'approved', '승인했어요')}>대기 {waiting.length}건 모두 승인</button>
            </Group>
          )}
          <People items={all} ctx={ctx} />
          <div className="btn-row">
            <button type="button" className="btn-ghost" onClick={() => bulk('approved', 'paid', '지급 완료로 바꿨어요')}>승인 건 지급 완료</button>
            <button type="button" className="btn-ghost" onClick={downloadCsv}>이번 달 정산표 (CSV)</button>
          </div>
        </>
      )}

      {list.length > 0 && <Chips scroll value={cat} onChange={setCat} items={[{ k: 'all', n: '전체' }, ...EXP_CATS.filter((c) => list.some((i) => i.category === c.k)).map((c) => ({ k: c.k, n: c.n, c: won(list.filter((i) => i.category === c.k && i.status !== 'rejected').reduce((n, i) => n + i.amount, 0)) }))]} />}
      <div className="list">
        {!shown.length ? <Empty title={tab === 'mine' ? '이 달에 올린 영수증이 없어요' : '이 달 비용이 아직 없어요'}>{tab === 'mine' ? '아래 버튼으로 영수증을 찍거나 캡처한 사진을 올리면 금액과 날짜를 읽어 채워 드려요.' : '팀원이 영수증을 올리면 여기에 모여요.'}</Empty>
          : shown.map((it) => <Row key={it.id} it={it} who={tab === 'all' ? ctx.nameOf(it.uid) : ''} onOpen={() => setViewing(it)} />)}
      </div>

      <div className="dock">
        <label htmlFor="xpFile" className="btn-primary dock-btn"><Icon k="expenses" /> 영수증 사진 올리기
          <input type="file" id="xpFile" accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            try { setAdding({ img: await compress(f) }) } catch { ctx.say('사진을 열 수 없어요. 다른 사진으로 올려 주세요.') }
          }} />
        </label>
        <button type="button" className="link small" onClick={() => setAdding({})}>영수증 없이 입력</button>
      </div>

      {adding && <AddSheet ctx={ctx} img={adding.img} onClose={() => setAdding(null)} onSaved={(r) => { setAdding(null); setMonth(r.date.slice(0, 7)); setTab(isAdmin ? tab : 'mine') }} />}
      {viewing && <ViewSheet it={viewing} ctx={ctx} onClose={() => setViewing(null)} />}
    </div>
  )
}

function People({ items, ctx }) {
  const by = {}
  items.forEach((i) => (by[i.uid] ||= []).push(i))
  const ids = Object.keys(by)
  if (!ids.length) return null
  return (
    <Group title="사람별">
      <div className="list">
        {ids.map((uid) => {
          const s = sums(by[uid])
          const bc = {}; by[uid].filter((i) => i.status !== 'rejected').forEach((i) => (bc[i.category] = (bc[i.category] || 0) + i.amount))
          return (
            <div className="person" key={uid}>
              <div className="person-h"><b>{ctx.nameOf(uid)}</b><span className="num">{won(s.total)}원</span></div>
              <div className="stackbar">{EXP_CATS.map((c, ix) => bc[c.k] ? <i key={c.k} title={`${c.n} ${won(bc[c.k])}원`} style={{ width: `${(bc[c.k] / (s.total || 1)) * 100}%`, background: CAT_COLOR[ix] }} /> : null)}</div>
              <div className="muted small">{by[uid].length}건 · 대기 {won(s.pending)} · 지급할 금액 {won(s.toPay)} · 지급 완료 {won(s.paid)}</div>
            </div>
          )
        })}
      </div>
      <div className="legend">{EXP_CATS.map((c, ix) => items.some((i) => i.category === c.k) && <span key={c.k}><i style={{ background: CAT_COLOR[ix] }} />{c.n}</span>)}</div>
    </Group>
  )
}

function Row({ it, who, onOpen }) {
  const c = EXP_CAT[it.category] || EXP_CAT.etc
  return (
    <button type="button" className="xrow" onClick={onOpen}>
      <span className="xthumb">{c.n.slice(0, 2)}</span>
      <span className="xmid">
        <span className="xt">{c.n}{it.pay === 'company' && <span className="xco">회사카드</span>}{it.via === 'telegram' && <span className="via">텔레그램</span>}</span>
        <span className="xs">{who && `${who} · `}{it.date.slice(5).replace('-', '.')}{it.memo && ` · ${it.memo}`}{!it.hasReceipt && ' · 영수증 없음'}</span>
      </span>
      <span className="xr"><span className="xamt num">{won(it.amount)}원</span><span className={`xpill st-${it.status}`}>{it.autoApproved && it.status === 'approved' ? '자동 승인' : EXP_STATUS[it.status]}</span></span>
    </button>
  )
}

function AddSheet({ ctx, img, onClose, onSaved }) {
  const limit = ctx.settings.approvalLimit
  const [amt, setAmt] = useState('')
  const [category, setCategory] = useState(null)
  const [date, setDate] = useState(todayStr())
  const [pay, setPay] = useState('personal')
  const [memo, setMemo] = useState('')
  const [read, setRead] = useState(img ? '정산 에이전트가 영수증을 읽는 중…' : '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const touched = useRef({})
  useEffect(() => {
    if (!img) return
    let alive = true
    readReceipt(img).then((r) => {
      if (!alive) return
      if (r.offline || r.error) return setRead(r.offline ? '에이전트 연결 전이라 직접 입력해 주세요' : '읽지 못했어요. 직접 입력해 주세요')
      const filled = []
      if (r.amount && !touched.current.amt) { setAmt(r.amount.toLocaleString('ko-KR')); filled.push('금액') }
      if (r.date && r.date <= todayStr() && !touched.current.date) { setDate(r.date); filled.push('날짜') }
      if (r.store && !touched.current.memo) setMemo(r.store)
      if (r.category && !touched.current.cat) { setCategory(r.category); filled.push('항목') }
      setRead(filled.length ? `${filled.join('·')}을 채웠어요. 확인해 주세요` : '직접 입력해 주세요')
    })
    return () => { alive = false }
  }, [img])
  const amount = parseMoney(amt)
  const hint = category && EXP_CAT[category].hint
  const submit = async () => {
    if (!amount) return setErr('금액을 적어 주세요.')
    if (!category) return setErr('항목을 골라 주세요.')
    if (category === 'entertain' && !memo.trim()) return setErr('접대비는 누구와 썼는지 적어 주세요.')
    setBusy(true); setErr('')
    try {
      const r = await addExpense(ctx.user, { date, month: date.slice(0, 7), amount, category, pay, memo: memo.trim().slice(0, 60) }, img || null, limit)
      if (r.status === 'pending') callAgent('notify', { kind: 'expense', id: r.id })
      ctx.say(r.status === 'pending' ? '저장했어요. 대표 승인 요청을 보냈어요' : '저장했어요 · 자동 승인')
      onSaved(r)
    } catch { setErr('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.') } finally { setBusy(false) }
  }
  return (
    <Sheet title="비용 입력" onClose={onClose} busy={busy} onSubmit={submit}>
      {img && <div className="receipt"><img src={img} alt="영수증 미리보기" />{read && <span className="read">{read}</span>}</div>}
      <label className="field"><span>금액</span>
        <div className="amount"><input className="num" inputMode="numeric" autoComplete="off" placeholder="0" value={amt} onChange={(e) => { touched.current.amt = 1; moneyInput(setAmt)(e) }} /><b>원</b></div>
      </label>
      {amount > 0 && <p className={amount >= limit ? 'hint' : 'muted small'}>{amount >= limit ? `${won(limit)}원 이상이라 대표 승인 후 지급돼요.` : '바로 승인돼요.'}</p>}
      <div className="field"><span>항목</span><Chips items={EXP_CATS} value={category} onChange={(k) => { touched.current.cat = 1; setCategory(k) }} /></div>
      {hint && <p className="hint">{hint}</p>}
      <div className="row2">
        <label className="field"><span>날짜</span><input type="date" className="inp" value={date} max={todayStr()} onChange={(e) => { touched.current.date = 1; setDate(e.target.value || todayStr()) }} /></label>
        <div className="field"><span>결제</span>
          <div className="seg">{[['personal', '내 돈'], ['company', '회사카드']].map(([v, n]) => <button type="button" key={v} aria-pressed={pay === v} onClick={() => setPay(v)}>{n}</button>)}</div>
        </div>
      </div>
      <label className="field"><span>{category === 'entertain' ? '누구와 (거래처·매장 이름)' : '메모 (거래처·장소)'}</span>
        <input className="inp" maxLength={60} value={memo} onChange={(e) => { touched.current.memo = 1; setMemo(e.target.value) }} placeholder="예: 망원동 ○○카페 미팅" />
      </label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}

function ViewSheet({ it, ctx, onClose }) {
  const [img, setImg] = useState(it.hasReceipt ? 'loading' : null)
  const [sure, setSure] = useState(false)
  const c = EXP_CAT[it.category] || EXP_CAT.etc
  useEffect(() => { if (it.hasReceipt) getReceipt(it).then((v) => setImg(v || 'missing')).catch(() => setImg('missing')) }, [it])
  const run = async (fn, msg) => { try { await fn(); ctx.say(msg); onClose() } catch { ctx.say('처리하지 못했어요') } }
  return (
    <Sheet title={`${c.n} ${won(it.amount)}원`} onClose={onClose}>
      <div className="receipt receipt-big">
        {img === null ? '영수증 없이 입력한 건이에요' : img === 'loading' ? '영수증 불러오는 중…' : img === 'missing' ? '영수증을 불러오지 못했어요' : <img src={img} alt="영수증" />}
      </div>
      <dl className="kv">
        <dt>담당</dt><dd>{ctx.nameOf(it.uid)}</dd>
        <dt>날짜</dt><dd>{it.date.replaceAll('-', '.')}</dd>
        <dt>결제</dt><dd>{it.pay === 'company' ? '회사카드 (지급 대상 아님)' : '내 돈 (지급 대상)'}</dd>
        <dt>메모</dt><dd>{it.memo || '—'}</dd>
        <dt>상태</dt><dd>{it.autoApproved && it.status === 'approved' ? `자동 승인 (${won(ctx.settings.approvalLimit)}원 미만)` : EXP_STATUS[it.status]}{it.decidedBy && ` · ${ctx.nameOf(it.decidedBy)}`}</dd>
        <dt>올린 곳</dt><dd>{it.via === 'telegram' ? '텔레그램' : '앱'}</dd>
      </dl>
      {ctx.isAdmin && (
        <div className="btn-row">
          {[['approved', '승인'], ['rejected', '반려'], ['paid', '지급 완료']].map(([v, n]) => (
            <button type="button" key={v} className="btn-ghost" disabled={it.status === v} onClick={() => run(() => setExpenseStatus(ctx.user, it, v), `${n} 처리했어요`)}>{n}</button>
          ))}
        </div>
      )}
      {(it.uid === ctx.user.id && it.status === 'pending') || ctx.isAdmin ? (
        <button type="button" className="link danger" onClick={() => (sure ? run(() => removeExpense(it), '삭제했어요') : setSure(true))}>{sure ? '한 번 더 누르면 삭제돼요' : '이 건 삭제'}</button>
      ) : null}
    </Sheet>
  )
}
