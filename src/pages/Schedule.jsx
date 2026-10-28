import { useMemo, useState } from 'react'
import { saveEvent, deleteEvent } from '../store.js'
import { TASK_TYPES } from '../../shared/constants.js'
import { buildTasks, isMine } from '../../shared/work.js'
import { addDays, dayLabel, todayStr, weekDays } from '../../shared/time.js'
import { Chips, Icon, PersonPick, Sheet, useSave } from '../ui.jsx'
import TaskRow from '../TaskRow.jsx'

/* 일정 — 통화·미팅·샵 관리·재발주·행사를 주 단위로 */
export default function Schedule({ ctx }) {
  const { user, data } = ctx
  const today = todayStr()
  const [base, setBase] = useState(today)
  const [scope, setScope] = useState(ctx.isAdmin ? 'all' : 'mine')
  const [type, setType] = useState('all')
  const [ev, setEv] = useState(null)
  const week = weekDays(base)
  const all = useMemo(() => buildTasks(data.leads, data.events), [data.leads, data.events])
  const shown = all.filter((t) => t.day >= week[0] && t.day <= week[6] && (scope === 'all' || isMine(t, user.id)) && (type === 'all' || t.type === type))
  const clash = useMemo(() => findClash(shown.filter((t) => t.type === 'meet' && !t.done)), [shown])

  return (
    <div className="stack">
      <div className="page-h">
        <h1 className="h">일정</h1>
        <div className="weeknav">
          <button type="button" onClick={() => setBase(addDays(base, -7))} aria-label="지난주">‹</button>
          <button type="button" className="link small" onClick={() => setBase(today)}>이번 주</button>
          <button type="button" onClick={() => setBase(addDays(base, 7))} aria-label="다음 주">›</button>
        </div>
      </div>
      <p className="muted">{dayLabel(week[0])} ~ {dayLabel(week[6])}</p>
      <div className="seg seg-2">
        <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>내 일정</button>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>팀 전체</button>
      </div>
      <Chips scroll value={type} onChange={setType} items={[{ k: 'all', n: '전체', c: shown.length }, ...TASK_TYPES.map((t) => ({ k: t.k, n: t.n }))]} />
      {clash.length > 0 && <p className="hint">시간이 겹치는 미팅이 있어요: {clash.map((c) => `${dayLabel(c.day)} ${c.at.slice(11, 16)} ${ctx.nameOf(c.ownerId)}`).join(', ')}</p>}

      <div className="week">
        {week.map((d) => {
          const items = shown.filter((t) => t.day === d)
          return (
            <section key={d} className={`wday ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''}`}>
              <h3>{dayLabel(d)}{d === today && <em>오늘</em>}<span className="count">{items.filter((t) => !t.done).length}</span></h3>
              {items.length ? <div className="tasks">{items.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} onEvent={setEv} />)}</div> : <p className="muted small">일정 없음</p>}
            </section>
          )
        })}
      </div>
      <p className="muted small">통화·미팅·관리·재발주는 고객 카드에서 정한 일정이 자동으로 들어와요. 세미나·행사·내부 회의는 아래 버튼으로 넣어 주세요.</p>
      <button type="button" className="fab" onClick={() => setEv({})}><Icon k="plus" size={20} /> 일정 추가</button>
      {ev && <EventSheet ctx={ctx} ev={ev} onClose={() => setEv(null)} />}
    </div>
  )
}

function findClash(meets) {
  const out = []
  for (let i = 0; i < meets.length; i++) for (let j = i + 1; j < meets.length; j++) {
    const a = meets[i], b = meets[j]
    if (a.ownerId && a.ownerId === b.ownerId && a.day === b.day && Math.abs(toMin(a.at) - toMin(b.at)) < 60) out.push(b)
  }
  return out
}
const toMin = (at) => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16))

export function EventSheet({ ctx, ev, onClose }) {
  const [f, setF] = useState({ title: ev.title || '', at: ev.at || '', place: ev.place || '', who: ev.who || 'all', note: ev.note || '' })
  const [sure, setSure] = useState(false)
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Sheet title={ev.id ? '일정 수정' : '일정 추가'} onClose={onClose} busy={busy} onSubmit={() => {
      if (!f.title.trim()) return setErr('무슨 일정인지 적어 주세요.')
      if (!f.at) return setErr('날짜·시간을 정해 주세요.')
      save(() => saveEvent(ctx.user, { ...ev, ...f, title: f.title.trim() }), '일정을 저장했어요')
    }}>
      <label className="field"><span>일정</span><input className="inp" value={f.title} maxLength={60} onChange={set('title')} placeholder="예: 오륜미네랄 체험 세미나, 주간 회의" /></label>
      <div className="row2">
        <label className="field"><span>날짜·시간</span><input type="datetime-local" className="inp" value={f.at} onChange={set('at')} /></label>
        <label className="field"><span>누구 일정</span><PersonPick id="evWho" ctx={ctx} allowAll value={f.who} onChange={(v) => setF((s) => ({ ...s, who: v }))} /></label>
      </div>
      <label className="field"><span>장소</span><input className="inp" value={f.place} maxLength={60} onChange={set('place')} /></label>
      <label className="field"><span>메모</span><textarea className="inp" rows={2} value={f.note} maxLength={300} onChange={set('note')} /></label>
      {err && <p className="err">{err}</p>}
      {ev.id && <button type="button" className="link danger" onClick={async () => { if (!sure) return setSure(true); await deleteEvent(ev); ctx.say('일정을 지웠어요'); onClose() }}>{sure ? '한 번 더 누르면 지워져요' : '이 일정 지우기'}</button>}
    </Sheet>
  )
}
