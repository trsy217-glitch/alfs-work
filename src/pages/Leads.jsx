import { useMemo, useState } from 'react'
import { createLead, editLead, act, deleteLead } from '../store.js'
import { CATEGORIES, CONTRACT, DUTIES, OPEN_STAGES, OWNER_OF_STAGE, STAGES, STAGE } from '../../shared/constants.js'
import { fmtWhen } from '../../shared/time.js'
import { Chips, Empty, Icon, PersonPick, Sheet, StagePill, useSave } from '../ui.jsx'

/* 고객 — 예비샵(진행 중)과 파트너샵을 목록·단계별 보드로 */
const GROUPS = { scout: ['new', 'called'], sales: ['booked', 'met', 'nego'] }

export default function Leads({ ctx, preset }) {
  const leads = ctx.data.leads
  const [q, setQ] = useState('')
  const [stage, setStage] = useState(preset || 'open')
  const [mine, setMine] = useState(false)
  const [view, setView] = useState(() => (window.innerWidth >= 900 ? 'board' : 'list'))
  const uid = ctx.user.id
  const counts = useMemo(() => { const c = { all: leads.length, open: 0, scout: 0, sales: 0 }; leads.forEach((l) => { c[l.stage] = (c[l.stage] || 0) + 1; if (OPEN_STAGES.includes(l.stage)) c.open++; if (GROUPS.scout.includes(l.stage)) c.scout++; if (GROUPS.sales.includes(l.stage)) c.sales++ }); return c }, [leads])
  const match = (l) => {
    if (mine && l.salesId !== uid && l.tmId !== uid && l.managerId !== uid) return false
    if (q) { const s = `${l.name} ${l.person} ${l.phone} ${l.region} ${l.category}`.toLowerCase(); if (!s.includes(q.toLowerCase().trim())) return false }
    return true
  }
  const shown = leads.filter((l) => match(l) && (GROUPS[stage] ? GROUPS[stage].includes(l.stage) : stage === 'open' ? OPEN_STAGES.includes(l.stage) : stage === 'all' || l.stage === stage))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">고객</h1>
        <div className="seg seg-sm">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>목록</button>
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>단계별 보드</button>
        </div>
      </div>
      <div className="search"><input id="q" className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="매장·이름·전화번호·지역 검색" aria-label="고객 검색" /></div>
      {view === 'list' && (
        <Chips scroll value={stage} onChange={setStage}
          items={[...(preset ? [{ k: preset, n: preset === 'scout' ? '발굴·통화 중' : '미팅·계약 협의', c: counts[preset] }] : []), { k: 'open', n: '예비샵 전체', c: counts.open }, { k: 'won', n: '파트너샵', c: counts.won || 0 }, { k: 'all', n: '전체', c: counts.all }, ...STAGES.filter((s) => s.k !== 'won').map((s) => ({ k: s.k, n: s.n, c: counts[s.k] || 0 }))]} />
      )}
      <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내가 담당인 고객만</label>

      {view === 'list' ? (
        <div className="list">
          {shown.length ? shown.map((l) => <LeadCard key={l.id} l={l} ctx={ctx} />)
            : <Empty title={leads.length ? '조건에 맞는 고객이 없어요' : '아직 등록한 고객이 없어요'}>{leads.length ? '검색어나 단계를 바꿔 보세요.' : "오른쪽 아래 '고객 등록'으로 첫 고객을 넣어 보세요. 텔레그램에 통화 메모를 보내도 발굴 에이전트가 카드로 만들어 줘요."}</Empty>}
        </div>
      ) : (
        <div className="board" role="list">
          {(GROUPS[preset] || [...OPEN_STAGES, 'won']).map((k) => {
            const col = leads.filter((l) => l.stage === k && match(l)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
            return (
              <section className="col" key={k} role="listitem" aria-label={STAGE[k].n}>
                <h3><span className={`dot tone-${STAGE[k].tone}`} />{STAGE[k].n}<span className="count">{col.length}</span></h3>
                <div className="col-list">{col.length ? col.map((l) => <LeadCard key={l.id} l={l} ctx={ctx} small />) : <p className="muted small center">없음</p>}</div>
              </section>
            )
          })}
        </div>
      )}
      <button type="button" className="fab" onClick={() => ctx.addLead()}><Icon k="plus" size={20} /> 고객 등록</button>
    </div>
  )
}

export function LeadCard({ l, ctx, small }) {
  const when = l.appt?.at && OPEN_STAGES.includes(l.stage) ? `미팅 ${fmtWhen(l.appt.at)}${l.appt.place ? ` · ${l.appt.place}` : ''}`
    : l.nextCall && OPEN_STAGES.includes(l.stage) ? `통화 ${fmtWhen(l.nextCall)}`
      : l.stage === 'won' && l.partner?.nextReorder ? `재발주 예상 ${fmtWhen(l.partner.nextReorder)}`
        : l.nextManage ? `관리 ${fmtWhen(l.nextManage)}` : ''
  const k = OWNER_OF_STAGE[l.stage]
  const d = DUTIES.find((x) => x.k === k)
  return (
    <button type="button" className={`card ${small ? 'card-sm' : ''}`} onClick={() => ctx.openLead(l.id)}>
      <span className="card-h"><b>{l.name}</b>{!small && <StagePill l={l} />}</span>
      <span className="card-s">{[l.category, l.region, l.person].filter(Boolean).join(' · ') || '정보 미입력'}</span>
      {when && <span className="card-when">{when}{l.appt && !l.apptAck && OPEN_STAGES.includes(l.stage) && <em className="unack">미확인</em>}</span>}
      <span className="card-f">
        {d ? (l[k] ? <>지금 {d.n} <b>{ctx.nameOf(l[k])}</b></> : <span className="muted">{d.n} 미정</span>) : <span className="muted">진행 멈춤</span>}
        {' · '}통화 {l.calls || 0} · 미팅 {l.meetings || 0}회{l.contract?.status && l.stage !== 'won' ? ` · ${CONTRACT[l.contract.status]?.n}` : ''}
      </span>
      {!small && l.lastText && <span className="card-last">{l.lastText}</span>}
    </button>
  )
}

export function LeadForm({ ctx, lead, preset = {}, onClose, onSaved, onDeleted }) {
  const [f, setF] = useState({
    name: lead?.name || preset.name || '', person: lead?.person || preset.person || '', phone: lead?.phone || preset.phone || '', region: lead?.region || preset.region || '', category: lead?.category || preset.category || '', memo: preset.memo || '',
    tmId: lead ? lead.tmId || '' : (['tm', 'admin'].includes(ctx.me.role) ? ctx.user.id : ''), salesId: lead?.salesId || '', managerId: lead?.managerId || '',
  })
  const [sure, setSure] = useState(false)
  const { busy, err, setErr, save } = useSave(ctx)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = () => {
    if (!f.name.trim()) return setErr('매장 이름을 적어 주세요.')
    if (!f.phone.trim()) return setErr('전화번호를 적어 주세요.')
    const dup = !lead && ctx.data.leads.find((l) => l.phone && l.phone.replace(/\D/g, '') === f.phone.replace(/\D/g, ''))
    if (dup && !sure) { setSure(true); return setErr(`같은 번호의 고객 '${dup.name}'이 이미 있어요. 그래도 등록하려면 한 번 더 누르세요.`) }
    const data = { name: f.name.trim(), person: f.person.trim(), phone: f.phone.trim(), region: f.region.trim(), category: f.category }
    const duty = Object.fromEntries(DUTIES.map((d) => [d.k, f[d.k] || null]))
    return save(async () => {
      if (lead) {
        const changes = DUTIES.filter((d) => (f[d.k] || null) !== (lead[d.k] || null)).map((d) => ({ n: d.n, id: f[d.k] || null }))
        if (changes.length) await act(ctx.user, lead, { type: 'assign', changes, text: '' }, { ...data, ...duty, ...(changes.some((c) => c.n === '영업') ? { apptAck: false } : {}) })
        else await editLead(lead, data)
        onSaved()
      } else {
        onSaved(await createLead(ctx.user, { ...data, ...duty, memo: f.memo.trim() }))
      }
    })
  }
  return (
    <Sheet title={lead ? '고객 정보 수정' : '고객 등록'} onClose={onClose} busy={busy} onSubmit={submit} submitLabel={lead ? '저장' : '등록'}>
      <label className="field"><span>매장 이름</span><input className="inp" value={f.name} maxLength={40} onChange={set('name')} /></label>
      <div className="row2">
        <label className="field"><span>원장·담당자</span><input className="inp" value={f.person} maxLength={20} onChange={set('person')} /></label>
        <label className="field"><span>전화번호</span><input className="inp" type="tel" inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => { setSure(false); set('phone')(e) }} /></label>
      </div>
      <label className="field"><span>지역</span><input className="inp" value={f.region} maxLength={40} onChange={set('region')} placeholder="예: 마포구 망원동" /></label>
      <div className="field"><span>업종</span><Chips items={CATEGORIES.map((c) => ({ k: c, n: c }))} value={f.category} onChange={(v) => setF((s) => ({ ...s, category: v }))} /></div>
      <div className="field"><span>역할별 담당 (나중에 정해도 돼요)</span>
        <div className="duty-picks">
          {DUTIES.map((d) => (
            <label key={d.k}><span>{d.n}</span><PersonPick id={`duty-${d.k}`} ctx={ctx} role={d.role} value={f[d.k]} onChange={(v) => setF((s) => ({ ...s, [d.k]: v }))} /></label>
          ))}
        </div>
      </div>
      {!lead && <label className="field"><span>메모 (어떻게 찾은 매장인지 등)</span><textarea className="inp" rows={2} value={f.memo} maxLength={300} onChange={set('memo')} /></label>}
      {err && <p className="err">{err}</p>}
      {lead && ctx.isAdmin && (
        <button type="button" className="link danger" onClick={async () => { if (sure !== 'del') return setSure('del'); try { await deleteLead(lead); onDeleted() } catch { setErr('삭제하지 못했어요.') } }}>
          {sure === 'del' ? '한 번 더 누르면 이 고객이 삭제돼요' : '이 고객 삭제'}
        </button>
      )}
    </Sheet>
  )
}
