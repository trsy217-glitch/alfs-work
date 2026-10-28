import { useMemo, useState } from 'react'
import { callAgent, deleteContent, saveContent } from '../store.js'
import { CHANNELS, CHANNEL, CONTENT_STATUS } from '../../shared/constants.js'
import { checkAd } from '../../shared/adRules.js'
import { addDays, dayLabel, fmtAgo, todayStr } from '../../shared/time.js'
import { Chips, Empty, Group, Icon, Sheet, useSave } from '../ui.jsx'

const ST_TONE = { draft: 'gray', review: 'blue', approved: 'teal', published: 'green' }

/* 마케팅 — 콘텐츠 달력, 에이전트 초안, 금지 표현 검사, 승인 → 발행 */
export default function Marketing({ ctx }) {
  const list = ctx.data.contents
  const [st, setSt] = useState('all')
  const [edit, setEdit] = useState(null)
  const today = todayStr()
  const counts = useMemo(() => { const c = { all: list.length }; list.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1 }); return c }, [list])
  const shown = list.filter((c) => st === 'all' || c.status === st).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const upcoming = shown.filter((c) => (c.date || '') >= today)
  const past = shown.filter((c) => (c.date || '') < today).reverse()
  const thisWeek = list.filter((c) => c.date >= today && c.date <= addDays(today, 6))

  return (
    <div className="stack">
      <div className="page-h"><h1 className="h">마케팅</h1></div>
      <div className="kpis">
        <div><b>{thisWeek.length}</b>이번 주 발행 예정</div>
        <div><b>{counts.review || 0}</b>승인 요청</div>
        <div><b>{list.filter((c) => c.status === 'published' && (c.date || '').slice(0, 7) === today.slice(0, 7)).length}</b>이번 달 발행</div>
      </div>
      <p className="muted small">마케팅 에이전트가 주 2회(화·목) 초안을 만들어 두면, 담당자가 고쳐서 승인 요청 → 대표 승인 → 발행 순서로 갑니다. 광고 기준(효능·질병·흡수율·디톡스 표현 금지, 수상·특허는 제조사 유디아미네랄 표기)은 저장할 때마다 자동으로 검사해요.</p>
      <Chips scroll value={st} onChange={setSt} items={[{ k: 'all', n: '전체', c: counts.all }, ...Object.entries(CONTENT_STATUS).map(([k, n]) => ({ k, n, c: counts[k] || 0 }))]} />

      <Group title="발행 예정" count={upcoming.length}>
        {upcoming.length ? <div className="list">{upcoming.map((c) => <ContentRow key={c.id} c={c} ctx={ctx} onOpen={() => setEdit(c)} />)}</div>
          : <Empty title="예정된 글이 없어요">아래 '글 만들기'에서 주제만 적으면 마케팅 에이전트가 블로그·인스타 초안을 써 줘요.</Empty>}
      </Group>
      {past.length > 0 && (
        <Group title="지난 글" count={past.length}>
          <div className="list">{past.slice(0, 30).map((c) => <ContentRow key={c.id} c={c} ctx={ctx} onOpen={() => setEdit(c)} />)}</div>
        </Group>
      )}
      <button type="button" className="fab" onClick={() => setEdit({})}><Icon k="plus" size={20} /> 글 만들기</button>
      {edit && <ContentSheet ctx={ctx} c={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ContentRow({ c, ctx, onOpen }) {
  const issues = checkAd(`${c.title} ${c.body}`)
  return (
    <button type="button" className="card" onClick={onOpen}>
      <span className="card-h"><b>{c.title || '(제목 없음)'}</b><span className={`pill tone-${ST_TONE[c.status]}`}>{CONTENT_STATUS[c.status]}</span></span>
      <span className="card-s">{CHANNEL[c.channel]?.n} · {c.date ? dayLabel(c.date) : '날짜 미정'} · {c.byAgent ? '마케팅 에이전트 초안' : ctx.nameOf(c.by)}</span>
      {issues.length > 0 && <span className="card-warn">고칠 표현 {issues.length}개: {issues.map((i) => i.word).join(', ')}</span>}
    </button>
  )
}

function ContentSheet({ ctx, c, onClose }) {
  const [f, setF] = useState({ channel: c.channel || 'blog', title: c.title || '', body: c.body || '', date: c.date || addDays(todayStr(), 2), url: c.url || '' })
  const [topic, setTopic] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [sure, setSure] = useState(false)
  const { busy, err, setErr, save } = useSave(ctx, onClose)
  const issues = checkAd(`${f.title}\n${f.body}`)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const status = c.status || 'draft'
  const store = (next, msg) => {
    if (!f.title.trim()) return setErr('제목을 적어 주세요.')
    if (['review', 'approved', 'published'].includes(next) && issues.length) return setErr(`광고 기준에 걸리는 표현을 먼저 고쳐 주세요: ${issues.map((i) => i.word).join(', ')}`)
    save(() => saveContent(ctx.user, { ...c, ...f, title: f.title.trim(), status: next }), msg)
    if (next === 'review' && c.status !== 'review') callAgent('notify', { kind: 'content', title: f.title.trim() })
  }
  const draft = async () => {
    if (!topic.trim()) return setErr('어떤 글을 쓸지 주제를 적어 주세요.')
    setDrafting(true); setErr('')
    const r = await callAgent('draft', { topic: topic.trim(), channel: f.channel })
    setDrafting(false)
    if (r.offline || r.error) return setErr(r.offline ? r.reason : r.error)
    setF((s) => ({ ...s, title: r.title || s.title, body: r.body || s.body }))
    ctx.say('초안을 받았어요. 읽고 고쳐 주세요')
  }
  return (
    <Sheet title={c.id ? '글 보기·고치기' : '글 만들기'} onClose={onClose} wide>
      <div className="field"><span>채널</span><Chips items={CHANNELS} value={f.channel} onChange={(v) => setF((s) => ({ ...s, channel: v }))} /></div>
      {!c.id && (
        <div className="agent-ask">
          <label className="field"><span>마케팅 에이전트에게 주제 주기</span><input className="inp" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder="예: 비 오는 날 따뜻한 미네랄 차 레시피, 파트너샵 모집" /></label>
          <button type="button" className="btn-mini" disabled={drafting} onClick={draft}><Icon k="spark" size={18} /> {drafting ? '쓰는 중…' : '초안 받기'}</button>
        </div>
      )}
      <label className="field"><span>제목</span><input className="inp" value={f.title} maxLength={100} onChange={set('title')} /></label>
      <label className="field"><span>본문</span><textarea className="inp" rows={10} value={f.body} maxLength={6000} onChange={set('body')} /></label>
      {issues.length > 0
        ? <div className="adcheck bad"><b>광고 기준 검사 · 고칠 표현 {issues.length}개</b><ul>{issues.map((i) => <li key={i.word}>'{i.word}' — {i.why}</li>)}</ul></div>
        : (f.body || f.title) && <div className="adcheck ok"><b>광고 기준 검사 통과</b></div>}
      <div className="row2">
        <label className="field"><span>발행일</span><input type="date" className="inp" value={f.date} onChange={set('date')} /></label>
        {(status === 'approved' || status === 'published') && <label className="field"><span>발행한 주소 (선택)</span><input className="inp" value={f.url} onChange={set('url')} placeholder="https://" /></label>}
      </div>
      {c.updatedAt && <p className="muted small">{c.byAgent ? '마케팅 에이전트 초안' : ctx.nameOf(c.by)} · {CONTENT_STATUS[status]} · {fmtAgo(c.updatedAt)}</p>}
      {err && <p className="err">{err}</p>}
      <div className="btn-row">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => store(status === 'draft' || !c.id ? 'draft' : status, '저장했어요')}>저장</button>
        {(status === 'draft' || !c.id) && <button type="button" className="btn-primary" disabled={busy} onClick={() => store(ctx.isAdmin ? 'approved' : 'review', ctx.isAdmin ? '승인했어요' : '대표에게 승인을 요청했어요')}>{ctx.isAdmin ? '승인' : '승인 요청'}</button>}
        {status === 'review' && ctx.isAdmin && <button type="button" className="btn-primary" disabled={busy} onClick={() => store('approved', '승인했어요')}>승인</button>}
        {status === 'review' && ctx.isAdmin && <button type="button" className="btn-ghost" disabled={busy} onClick={() => store('draft', '초안으로 돌려보냈어요')}>다시 고치기</button>}
        {status === 'approved' && <button type="button" className="btn-primary" disabled={busy} onClick={() => store('published', '발행 완료로 표시했어요')}>발행 완료</button>}
      </div>
      {c.id && <button type="button" className="link danger" onClick={async () => { if (!sure) return setSure(true); await deleteContent(c); ctx.say('지웠어요'); onClose() }}>{sure ? '한 번 더 누르면 지워져요' : '이 글 지우기'}</button>}
    </Sheet>
  )
}
