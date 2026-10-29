import { useEffect, useMemo, useState } from 'react'
import { addDrive, removeDrive, watchDrives } from '../store.js'
import { shiftMonth, todayStr, won } from '../../shared/time.js'
import { Chips, Empty, Group, Sheet } from '../ui.jsx'
import { ls } from '../safeStorage.js'

/* 차량운행일지 — 업무용 차량 운행 기록 (국세청 업무용승용차 운행기록부 양식으로 내려받기) */
export const PURPOSES = [
  { k: 'visit', n: '고객 방문' },
  { k: 'partner', n: '파트너샵 관리' },
  { k: 'delivery', n: '배송·납품' },
  { k: 'event', n: '행사·세미나' },
  { k: 'commute', n: '출퇴근' },
  { k: 'etc', n: '기타 업무' },
]
const PUR = Object.fromEntries(PURPOSES.map((p) => [p.k, p]))
const CAR_KEY = 'alfs_work_car'
const km = (n) => `${won(Math.round(n * 10) / 10)}`

export default function Drives({ ctx }) {
  const { user, isAdmin } = ctx
  const [rows, setRows] = useState([])
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [tab, setTab] = useState(isAdmin ? 'all' : 'mine')
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState(null)
  useEffect(() => watchDrives(isAdmin ? null : user.id, setRows), [isAdmin, user.id])

  const inMonth = rows.filter((r) => r.month === month).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const list = tab === 'all' ? inMonth : inMonth.filter((r) => r.uid === user.id)
  const total = list.reduce((n, r) => n + (r.km || 0), 0)
  const commute = list.filter((r) => r.purpose === 'commute').reduce((n, r) => n + (r.km || 0), 0)
  const mineAll = rows.filter((r) => r.uid === user.id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const [y, m] = month.split('-')

  function downloadCsv() {
    const out = [...list].reverse()
    if (!out.length) return ctx.say('이 달 운행 기록이 없어요')
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
    const head = ['사용일자', '성명', '차량', '목적', '출발지', '도착지', '거래처', '주행 전 계기판(km)', '주행 후 계기판(km)', '주행거리(km)', '출퇴근용(km)', '일반업무용(km)', '비고']
    const lines = [head.map(esc).join(',')]
    out.forEach((r) => lines.push([r.date, ctx.nameOf(r.uid), r.car, PUR[r.purpose]?.n || '기타 업무', r.from, r.to, r.client, r.startKm ?? '', r.endKm ?? '', r.km, r.purpose === 'commute' ? r.km : 0, r.purpose === 'commute' ? 0 : r.km, r.memo].map(esc).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `알프스_차량운행일지_${month}.csv`
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const byPerson = useMemo(() => {
    const by = {}
    inMonth.forEach((r) => { (by[r.uid] ||= { n: 0, km: 0 }); by[r.uid].n++; by[r.uid].km += r.km || 0 })
    return Object.entries(by)
  }, [inMonth])

  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">차량운행일지</h1>
        <div className="weeknav" aria-label="운행 월">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
          <b className="num">{y}.{m}</b>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
        </div>
      </div>
      {isAdmin && (
        <div className="seg seg-2">
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>내 운행</button>
          <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>팀 전체</button>
        </div>
      )}
      <div className="sum">
        <div className="sum-l">{Number(m)}월 {tab === 'all' ? '팀 전체 주행' : '내 주행'}</div>
        <div className="sum-t num">{km(total)}<small>km</small></div>
        <div className="sum-split">
          <div>운행<b className="num">{list.length}건</b></div>
          <div>일반 업무<b className="num">{km(total - commute)}</b></div>
          <div>출퇴근<b className="num">{km(commute)}</b></div>
        </div>
      </div>
      <p className="muted small">운행할 때마다 계기판 숫자를 적어 두면 월말에 국세청 '업무용승용차 운행기록부' 양식으로 내려받을 수 있어요. 차량 유지비를 비용으로 인정받을 때 필요한 기록이에요.</p>

      {tab === 'all' && byPerson.length > 0 && (
        <Group title="사람별">
          <div className="list">
            {byPerson.map(([uid, v]) => (
              <div className="person" key={uid}>
                <div className="person-h"><b>{ctx.nameOf(uid)}</b><span className="num">{km(v.km)}km</span></div>
                <div className="muted small">{v.n}건</div>
              </div>
            ))}
          </div>
        </Group>
      )}

      <div className="list">
        {!list.length ? <Empty title="이 달 운행 기록이 없어요">아래 '운행 기록'을 눌러 출발·도착 계기판 숫자와 목적을 남겨 주세요.</Empty>
          : list.map((r) => (
            <button type="button" key={r.id} className="xrow" onClick={() => setViewing(r)}>
              <span className="xthumb">{(PUR[r.purpose]?.n || '기타').slice(0, 2)}</span>
              <span className="xmid">
                <span className="xt">{r.from || '출발지'} → {r.to || '도착지'}</span>
                <span className="xs">{tab === 'all' && `${ctx.nameOf(r.uid)} · `}{r.date.slice(5).replace('-', '.')} · {PUR[r.purpose]?.n || '기타 업무'}{r.client && ` · ${r.client}`}</span>
              </span>
              <span className="xamt num">{km(r.km)}km</span>
            </button>
          ))}
      </div>
      <div className="btn-row"><button type="button" className="btn-ghost" onClick={downloadCsv}>이번 달 운행기록부 (CSV)</button></div>

      <div className="dock">
        <button type="button" className="btn-primary dock-btn" onClick={() => setAdding(true)}>＋ 운행 기록</button>
      </div>

      {adding && <AddDrive ctx={ctx} last={mineAll[0]} onClose={() => setAdding(false)} onSaved={(r) => { setAdding(false); setMonth(r.month); }} />}
      {viewing && (
        <Sheet title="운행 기록" onClose={() => setViewing(null)}>
          <dl className="kv">
            <dt>날짜</dt><dd>{viewing.date}</dd>
            <dt>운전</dt><dd>{ctx.nameOf(viewing.uid)}{viewing.car && ` · ${viewing.car}`}</dd>
            <dt>구간</dt><dd>{viewing.from} → {viewing.to}</dd>
            <dt>목적</dt><dd>{PUR[viewing.purpose]?.n || '기타 업무'}{viewing.client && ` · ${viewing.client}`}</dd>
            <dt>계기판</dt><dd className="num">{viewing.startKm != null ? `${won(viewing.startKm)} → ${won(viewing.endKm)}` : '—'}</dd>
            <dt>주행거리</dt><dd className="num">{km(viewing.km)}km</dd>
            {viewing.memo && <><dt>메모</dt><dd>{viewing.memo}</dd></>}
          </dl>
          {(isAdmin || viewing.uid === user.id) && (
            <button type="button" className="link danger small" onClick={async () => { await removeDrive(viewing); setViewing(null); ctx.say('삭제했어요') }}>이 기록 삭제</button>
          )}
        </Sheet>
      )}
    </div>
  )
}

function AddDrive({ ctx, last, onClose, onSaved }) {
  const [date, setDate] = useState(todayStr())
  const [car, setCar] = useState(ls.get(CAR_KEY, '') || last?.car || '')
  const [startKm, setStartKm] = useState(last?.endKm != null ? String(last.endKm) : '')
  const [endKm, setEndKm] = useState('')
  const [direct, setDirect] = useState('')
  const [from, setFrom] = useState(last?.to || '')
  const [to, setTo] = useState('')
  const [purpose, setPurpose] = useState('visit')
  const [client, setClient] = useState('')
  const [memo, setMemo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const num = (v) => (v === '' ? null : Number(String(v).replace(/[^\d.]/g, '')))
  const s = num(startKm), e = num(endKm)
  const auto = s != null && e != null && e >= s ? Math.round((e - s) * 10) / 10 : null
  const dist = auto ?? num(direct)
  const shops = useMemo(() => (ctx.data.leads || []).map((l) => l.name).filter(Boolean).slice(0, 300), [ctx.data.leads])

  const submit = async () => {
    if (s != null && e != null && e < s) return setErr('도착 계기판 숫자가 출발보다 작아요.')
    if (dist == null || !(dist > 0)) return setErr('출발·도착 계기판 숫자를 적거나, 주행거리를 직접 적어 주세요.')
    if (dist >= 3000) return setErr('주행거리가 너무 커요. 숫자를 확인해 주세요.')
    if (!to.trim()) return setErr('도착지를 적어 주세요.')
    setBusy(true); setErr('')
    try {
      ls.set(CAR_KEY, car.trim())
      const r = await addDrive(ctx.user, {
        date, month: date.slice(0, 7), car: car.trim().slice(0, 20), from: from.trim().slice(0, 40), to: to.trim().slice(0, 40),
        purpose, client: client.trim().slice(0, 40), startKm: auto != null ? s : null, endKm: auto != null ? e : null, km: dist, memo: memo.trim().slice(0, 80),
      })
      ctx.say(`${km(dist)}km 운행을 기록했어요`)
      onSaved(r)
    } catch { setErr('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.') } finally { setBusy(false) }
  }
  const numIn = (setter) => (ev) => setter(ev.target.value.replace(/[^\d.]/g, ''))
  return (
    <Sheet title="운행 기록" onClose={onClose} busy={busy} onSubmit={submit}>
      <div className="row2">
        <label className="field"><span>날짜</span><input type="date" className="inp" value={date} max={todayStr()} onChange={(ev) => setDate(ev.target.value || todayStr())} /></label>
        <label className="field"><span>차량 (차량번호)</span><input className="inp" value={car} onChange={(ev) => setCar(ev.target.value)} placeholder="예: 12가 3456" /></label>
      </div>
      <div className="row2">
        <label className="field"><span>출발 계기판 (km)</span><input className="inp num" inputMode="decimal" value={startKm} onChange={numIn(setStartKm)} placeholder="예: 45210" /></label>
        <label className="field"><span>도착 계기판 (km)</span><input className="inp num" inputMode="decimal" value={endKm} onChange={numIn(setEndKm)} placeholder="예: 45248" /></label>
      </div>
      {auto != null ? <p className="hint">주행거리 {km(auto)}km</p> : (
        <label className="field"><span>또는 주행거리 직접 (km)</span><input className="inp num" inputMode="decimal" value={direct} onChange={numIn(setDirect)} placeholder="계기판을 못 봤으면 대략의 거리" /></label>
      )}
      <div className="row2">
        <label className="field"><span>출발지</span><input className="inp" value={from} onChange={(ev) => setFrom(ev.target.value)} placeholder="예: 상암 사무실" /></label>
        <label className="field"><span>도착지</span><input className="inp" value={to} onChange={(ev) => setTo(ev.target.value)} placeholder="예: 망원동 초록카페" /></label>
      </div>
      <div className="field"><span>목적</span><Chips items={PURPOSES} value={purpose} onChange={setPurpose} /></div>
      <label className="field"><span>거래처 (선택)</span>
        <input className="inp" list="drive-shops" value={client} onChange={(ev) => setClient(ev.target.value)} placeholder="방문한 매장·고객 이름" />
        <datalist id="drive-shops">{shops.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <label className="field"><span>메모 (선택)</span><input className="inp" maxLength={80} value={memo} onChange={(ev) => setMemo(ev.target.value)} placeholder="예: 시음 샘플 전달" /></label>
      {err && <p className="err">{err}</p>}
    </Sheet>
  )
}
