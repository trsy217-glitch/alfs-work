import { useState } from 'react'
import { setCheck, setEventDone } from './store.js'
import { TASK } from '../shared/constants.js'
import { dayLabel, fmtWhen, telHref, todayStr } from '../shared/time.js'
import { Icon } from './ui.jsx'

/** 할 일 한 줄 — 체크하면 완료 기록이 고객 대화창에 남습니다 */
export default function TaskRow({ t, ctx, onEvent, showDay }) {
  const [busy, setBusy] = useState(false)
  const tt = TASK[t.type]
  const l = t.lead
  const late = !t.done && t.day < todayStr()
  const toggle = async () => {
    setBusy(true)
    try {
      if (t.event) await setEventDone(ctx.user, t.event, !t.done)
      else await setCheck(ctx.user, l, t.key, !t.done, { task: t.type, taskAt: t.at, text: `${tt.n} 완료 (${fmtWhen(t.at)})` })
      ctx.say(t.done ? '체크를 풀었어요' : `${tt.n} 완료로 체크했어요`)
    } catch { ctx.say('체크하지 못했어요') } finally { setBusy(false) }
  }
  const open = () => (t.event ? onEvent?.(t.event) : ctx.openLead(l.id))
  const who = t.forAll ? '팀 전체' : t.ownerId ? `담당 ${ctx.nameOf(t.ownerId)}` : '담당 미정'
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <button type="button" className="tick" role="checkbox" aria-checked={!!t.done} aria-label={`${t.title} ${tt.n} 완료`} disabled={busy} onClick={toggle}>{t.done ? '✓' : ''}</button>
      <button type="button" className="task-main" onClick={open}>
        <span className="task-h">
          <span className={`pill tone-${tt.tone}`}>{tt.n}</span>
          <b className="task-time">{showDay && `${dayLabel(t.day)} `}{t.type === 'reorder' ? '' : t.at.slice(11, 16)}</b>
          {late && <em className="late">밀림 · {dayLabel(t.day)}</em>}
          {t.type === 'meet' && l && !l.apptAck && <em className="unack">미확인</em>}
          {t.type === 'meet' && l?.prep?.text && <em className="prep-tag">준비 메모</em>}
        </span>
        <span className="task-name">{t.title}</span>
        <span className="task-s">{[t.place, l?.person, who].filter(Boolean).join(' · ')}{t.done && ` · ${ctx.nameOf(t.done.by)} 완료`}</span>
      </button>
      {l?.phone ? <a className="task-call" href={telHref(l.phone)} aria-label={`${l.name}에 전화`}><Icon k="phone" size={20} /></a> : <span />}
    </div>
  )
}
