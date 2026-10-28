import { useMemo, useState } from 'react'
import { OPEN_STAGES, TASK_TYPES, CONTENT_STATUS } from '../../shared/constants.js'
import { briefingFor, buildTasks, isMine } from '../../shared/work.js'
import { daysBetween, dayLabel, fmtAgo, fmtWhen, kst, todayStr, weekDays, won } from '../../shared/time.js'
import { Empty, Group, Icon, StagePill } from '../ui.jsx'
import TaskRow from '../TaskRow.jsx'
import { EventSheet } from './Schedule.jsx'
import { MeetingPrep } from './LeadDetail.jsx'

/* 오늘 — 아침 브리핑 + 오늘 할 일 + 확인·승인할 것 + 팀 소식 */
export default function Today({ ctx }) {
  const { user, me, data } = ctx
  const [scope, setScope] = useState(me.role === 'admin' ? 'all' : 'mine')
  const [type, setType] = useState('all')
  const [ev, setEv] = useState(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const today = todayStr()
  const week = weekDays(today)
  const all = useMemo(() => buildTasks(data.leads, data.events), [data.leads, data.events])
  const scoped = all.filter((t) => scope === 'all' || isMine(t, user.id))
  const inType = (t) => type === 'all' || t.type === type
  const todayList = scoped.filter((t) => inType(t) && (t.day === today || (t.day < today && !t.done)))
  const weekRest = scoped.filter((t) => inType(t) && t.day > today && t.day <= week[6])
  const brief = useMemo(() => briefingFor({ ...me, id: user.id }, data, kst()), [me, user.id, data])

  const open = data.leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const toAck = open.filter((l) => l.appt && !l.apptAck && l.salesId === user.id)
  const soonMeet = open.filter((l) => l.appt?.at && l.salesId === user.id && daysBetween(today, l.appt.at) >= 0 && daysBetween(today, l.appt.at) <= 3)
    .sort((a, b) => a.appt.at.localeCompare(b.appt.at))
  const late = open.filter((l) => l.stage === 'booked' && l.appt?.at && l.appt.at.slice(0, 10) < today && (scope === 'all' || l.salesId === user.id))
  const waitExp = ctx.isAdmin ? data.expenses.filter((e) => e.status === 'pending') : []
  const waitCt = ctx.isAdmin ? data.contents.filter((c) => c.status === 'review') : []
  const news = data.activity.filter((a) => a.by !== user.id && a.type !== 'check').slice(0, 6)
  const count = (k) => scoped.filter((t) => t.type === k && !t.done && (t.day === today || t.day < today)).length
  const hour = Number(kst().time.slice(0, 2))

  return (
    <div className="stack">
      <div className="hello">
        <p className="muted">{dayLabel(today)}</p>
        <h1 className="h">{hour < 12 ? '좋은 아침이에요' : hour < 18 ? '오후도 힘내요' : '오늘도 수고했어요'}, {me.name}님</h1>
      </div>

      <section className="brief">
        <div className="brief-h"><Icon k="spark" /><b>비서 에이전트 브리핑</b><span className="muted small">{me.tgChatId ? '텔레그램으로 매일 아침 받아요' : '텔레그램을 연결하면 아침마다 받아요'}</span></div>
        <div className="brief-body">
          {(briefOpen ? brief.sections : brief.sections.slice(0, 2)).map((s) => (
            <div key={s.h}><b>{s.h}</b><ul>{s.items.slice(0, briefOpen ? 20 : 4).map((i, n) => <li key={n}>{i}</li>)}</ul></div>
          ))}
        </div>
        {brief.sections.length > 2 && <button type="button" className="link small" onClick={() => setBriefOpen(!briefOpen)}>{briefOpen ? '접기' : `브리핑 전체 보기 (${brief.sections.length}개 항목)`}</button>}
      </section>

      {(waitExp.length > 0 || waitCt.length > 0) && (
        <Group title="승인할 것" tone="alert" count={waitExp.length + waitCt.length}>
          <div className="list">
            {waitExp.length > 0 && <button type="button" className="news" onClick={() => ctx.go('expenses')}><span className="news-h"><b>비용 {waitExp.length}건</b> · {won(waitExp.reduce((n, e) => n + e.amount, 0))}원</span><span className="news-t">{ctx.settings.approvalLimit.toLocaleString('ko-KR')}원 이상은 대표 승인 후 지급돼요</span></button>}
            {waitCt.length > 0 && <button type="button" className="news" onClick={() => ctx.go('marketing')}><span className="news-h"><b>마케팅 글 {waitCt.length}건</b> · {CONTENT_STATUS.review}</span><span className="news-t">{waitCt.map((c) => c.title).join(', ')}</span></button>}
          </div>
        </Group>
      )}

      {toAck.length > 0 && (
        <Group title="확인할 미팅 예약" tone="alert" count={toAck.length} note="TM이 잡아 넘긴 미팅이에요. 열어서 '확인'을 누르면 TM에게 알림이 가요.">
          <div className="list">{toAck.map((l) => (
            <button type="button" className="card" key={l.id} onClick={() => ctx.openLead(l.id)}>
              <span className="card-h"><b>{l.name}</b><StagePill l={l} /></span>
              <span className="card-when">미팅 {fmtWhen(l.appt.at)}{l.appt.place && ` · ${l.appt.place}`}<em className="unack">미확인</em></span>
              <span className="card-s">잡은 사람 {ctx.nameOf(l.tmId)}</span>
            </button>
          ))}</div>
        </Group>
      )}

      <div className="seg seg-2">
        <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>내 일</button>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>팀 전체</button>
      </div>
      <div className="tiles">
        {TASK_TYPES.filter((x) => x.k !== 'reorder').map((tt) => (
          <button type="button" key={tt.k} className={`tile tile-${tt.tone}`} aria-pressed={type === tt.k} onClick={() => setType(type === tt.k ? 'all' : tt.k)}>
            <span>{tt.n}</span><b>{count(tt.k) + (tt.k === 'manage' ? count('reorder') : 0)}</b>
          </button>
        ))}
      </div>

      <Group title={`오늘 할 일 · ${dayLabel(today)}`} count={todayList.filter((t) => !t.done).length}>
        {todayList.length ? <div className="tasks">{todayList.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} onEvent={setEv} />)}</div>
          : <Empty>오늘 통화·미팅·관리 일정이 없어요.</Empty>}
      </Group>

      {soonMeet.length > 0 && (
        <Group title="다가오는 내 미팅 준비" count={soonMeet.length} note="영업지원 에이전트가 지난 기록을 보고 할 이야기와 준비물을 정리해요.">
          <div className="list">{soonMeet.map((l) => <MeetingPrep key={l.id} l={l} ctx={ctx} compact />)}</div>
        </Group>
      )}

      {weekRest.length > 0 && (
        <Group title="이번 주 남은 일" count={weekRest.filter((t) => !t.done).length}>
          <div className="tasks">{weekRest.slice(0, 12).map((t) => <TaskRow key={t.id} t={t} ctx={ctx} onEvent={setEv} showDay />)}</div>
          {weekRest.length > 12 && <button type="button" className="link small" onClick={() => ctx.go('schedule')}>일정에서 {weekRest.length - 12}건 더 보기</button>}
        </Group>
      )}

      {late.length > 0 && (
        <Group title="결과를 안 적은 미팅" tone="warn" count={late.length}>
          <div className="list">{late.map((l) => (
            <button type="button" className="card" key={l.id} onClick={() => ctx.openLead(l.id)}>
              <span className="card-h"><b>{l.name}</b><StagePill l={l} /></span>
              <span className="card-when">미팅 {fmtWhen(l.appt.at)} · 결과를 남겨 주세요</span>
            </button>
          ))}</div>
        </Group>
      )}

      {news.length > 0 && (
        <Group title="팀 최근 소식">
          <div className="list">{news.map((a) => (
            <button type="button" key={a.id} className="news" onClick={() => a.leadId && ctx.openLead(a.leadId)}>
              <span className="news-h"><b>{ctx.nameOf(a.by)}</b> · {a.leadName}<span className="muted"> · {fmtAgo(a.at)}</span></span>
              {a.text && <span className="news-t">{a.text}</span>}
            </button>
          ))}</div>
        </Group>
      )}

      <button type="button" className="fab" onClick={() => ctx.addLead()}><Icon k="plus" size={20} /> 고객 등록</button>
      {ev && <EventSheet ctx={ctx} ev={ev} onClose={() => setEv(null)} />}
    </div>
  )
}
