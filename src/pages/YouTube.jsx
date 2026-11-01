import { useEffect, useMemo, useRef, useState } from 'react'
import { callYt, deleteYt, saveContent, saveYt, watchYt } from '../store.js'
import { checkAd } from '../../shared/adRules.js'
import { addDays, fmtAgo, todayStr } from '../../shared/time.js'
import { Chips, Empty, Group } from '../ui.jsx'
import { toTubeInsight } from '../../shared/tubeinsight.js'

/* 마케팅 > 유튜브 스튜디오 — TubeInsight 를 알프스 워크 안으로
   ① 영상 분석 ② 기획·나레이션 ③ 채널 세팅 ④ SNS 원소스 + 보관함 */
const TABS = [
  { k: 'analyze', n: '① 영상 분석' },
  { k: 'plan', n: '② 기획·나레이션' },
  { k: 'channel', n: '③ 채널 세팅' },
  { k: 'omni', n: '④ SNS·블로그·뉴스레터' },
  { k: 'saved', n: '보관함' },
]
const KIND = { analysis: '영상 분석', plan: '기획서', channel: '채널 세팅', omni: 'SNS·블로그·뉴스레터' }
const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh-TW', '繁體中文'], ['zh-CN', '简体中文'], ['vi', 'Tiếng Việt'], ['es', 'Español']]

export default function YouTubeStudio({ ctx }) {
  const [tab, setTab] = useState('analyze')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null) // 보관함에서 연 항목
  const [seed, setSeed] = useState(null) // 다른 탭으로 넘길 재료
  useEffect(() => watchYt(setItems), [])
  const analyses = items.filter((x) => x.kind === 'analysis')
  const plans = items.filter((x) => x.kind === 'plan')
  const go = (t, s) => { setSeed(s || null); setOpen(null); setTab(t) }
  const props = { ctx, items, analyses, plans, go, seed }
  return (
    <div className="stack yt">
      <div className="yt-intro">
        <b>유튜브 스튜디오</b>
        <span className="muted small">벤치마크 영상 분석 → 8초 씬 기획·나레이션·AI 영상/이미지 프롬프트 → 채널 세팅 → 스레드·블로그·뉴스레터까지. 만든 것은 보관함에 팀 전체가 함께 봐요.</span>
      </div>
      <Chips scroll value={tab} onChange={(k) => { setOpen(null); setTab(k) }} items={TABS.map((t) => ({ ...t, c: t.k === 'saved' ? items.length : undefined }))} />
      {tab === 'analyze' && <Analyze {...props} />}
      {tab === 'plan' && <Plan {...props} />}
      {tab === 'channel' && <Channel {...props} />}
      {tab === 'omni' && <Omni {...props} />}
      {tab === 'saved' && (open ? <SavedView item={open} {...props} onBack={() => setOpen(null)} /> : <Saved {...props} onOpen={setOpen} />)}
    </div>
  )
}

/* ── 공통 도구 ── */
function useRun(ctx) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const run = async (label, fn) => {
    setBusy(label); setErr('')
    try { return await fn() } catch (e) { setErr(e.message || '실패했어요'); return null } finally { setBusy('') }
  }
  const call = async (action, payload) => {
    const r = await callYt(action, payload)
    if (r.offline) throw new Error(r.reason)
    if (r.error) throw new Error(r.error)
    return r
  }
  return { busy, err, setErr, run, call, ctx }
}
const copy = (ctx, text, what = '복사했어요') => navigator.clipboard?.writeText(String(text || '')).then(() => ctx.say(what), () => ctx.say('복사하지 못했어요'))
function download(name, text, type = 'text/plain') {
  const blob = new Blob([type.startsWith('text/') ? '﻿' + text : text], { type: `${type};charset=utf-8` })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'alfs'
function speak(text, onEnd) {
  const ss = window.speechSynthesis; if (!ss) return false
  ss.cancel()
  const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.05
  const v = ss.getVoices().find((x) => x.lang?.startsWith('ko')); if (v) u.voice = v
  if (onEnd) u.onend = onEnd
  ss.speak(u); return true
}
const Copy = ({ ctx, text, label = '복사' }) => <button type="button" className="btn-mini" onClick={() => copy(ctx, text)}>{label}</button>
const Busy = ({ text }) => text ? <div className="yt-busy"><span className="spin" />{text}</div> : null
const Err = ({ text }) => text ? <p className="err">{text}</p> : null
const AdWarn = ({ text }) => { const is = checkAd(text); return is.length ? <p className="card-warn">고칠 표현 {is.length}개: {is.map((i) => `${i.word}(${i.why})`).join(', ')}</p> : null }

/** 아주 단순한 마크다운 → 화면 (제목·목록·굵게) */
function Md({ text }) {
  const lines = String(text || '').split('\n')
  const out = []; let list = null
  const flush = () => { if (list) { out.push(list.ordered ? <ol key={out.length}>{list.items}</ol> : <ul key={out.length}>{list.items}</ul>); list = null } }
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p))
  lines.forEach((raw, i) => {
    const l = raw.trimEnd()
    const h = l.match(/^(#{1,4})\s+(.*)/)
    const b = l.match(/^\s*[-*·]\s+(.*)/)
    const o = l.match(/^\s*\d+[.)]\s+(.*)/)
    if (h) { flush(); const T = `h${Math.min(6, h[1].length + 2)}`; out.push(<T key={i}>{inline(h[2])}</T>) }
    else if (b || o) { const ordered = !!o; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } } list.items.push(<li key={i}>{inline((b || o)[1])}</li>) }
    else if (l === '---') { flush(); out.push(<hr key={i} />) }
    else if (!l.trim()) flush()
    else { flush(); out.push(<p key={i}>{inline(l)}</p>) }
  })
  flush()
  return <div className="md">{out}</div>
}

/* ── ① 영상 분석 ── */
function Analyze({ ctx, go, seed }) {
  const [url, setUrl] = useState(seed?.url || '')
  const [res, setRes] = useState(seed?.analysis || null)
  const r = useRun(ctx)
  const start = () => r.run('Gemini가 영상을 보고 흥행 공식을 정리하는 중… (보통 20~50초)', async () => {
    const a = await r.call('analyze', { url })
    setRes(a)
    await saveYt(ctx.user, 'analysis', a.info.title || url, a)
    ctx.say('분석을 보관함에 저장했어요')
  })
  return (
    <div className="stack">
      <div className="panel-box">
        <label className="field"><span>벤치마크할 유튜브 영상 주소</span>
          <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=… 또는 youtu.be/… · shorts/…" inputMode="url" />
        </label>
        <button type="button" className="btn-primary" disabled={!!r.busy || !url.trim()} onClick={start}>분석 시작</button>
        <p className="muted small">공개 영상은 Gemini가 영상(앞 12분)을 직접 보고 훅 구조·5단계 전개·핵심 메시지·시청자 반응·내 채널 적용법을 정리해요. 비공개·연령 제한 영상은 제목·설명·댓글만으로 분석해요.</p>
        <Busy text={r.busy} /><Err text={r.err} />
      </div>
      {res && <AnalysisView a={res} ctx={ctx} go={go} />}
    </div>
  )
}

function AnalysisView({ a, ctx, go }) {
  const s = a.sentiment || {}
  return (
    <div className="stack">
      <div className="yt-head">
        <img src={a.thumbnail} alt="" loading="lazy" />
        <div>
          <b>{a.info?.title}</b>
          <span className="muted small">{a.info?.channel}{a.info?.views ? ` · 조회수 ${a.info.views.toLocaleString('ko-KR')}` : ''}{a.info?.published ? ` · ${a.info.published}` : ''}</span>
          <span className="muted small">{a.watched ? '영상을 직접 보고 분석' : '영상 대신 정보·댓글로 분석'} · {a.engine}</span>
          <div className="btn-row">
            <button type="button" className="btn-mini" onClick={() => go('plan', { analysis: a })}>이 영상 공식으로 기획하기</button>
            <button type="button" className="btn-mini" onClick={() => go('omni', { topic: a.info?.title, context: `${a.core_message}\n\n${a.report_md}` })}>SNS 글 만들기</button>
            <a className="btn-mini" href={a.url} target="_blank" rel="noreferrer">영상 열기</a>
          </div>
        </div>
      </div>
      <div className="yt-grid">
        <section className="yt-card"><h4>제목 훅</h4><p className="yt-hook"><mark>{a.hook?.part_a}</mark> {a.hook?.part_b}</p><p className="muted small">{a.hook?.mechanism}</p></section>
        <section className="yt-card"><h4>핵심 메시지</h4><p>{a.core_message}</p><p className="yt-tags">{(a.keywords || []).map((k) => <span key={k}>{k}</span>)}</p></section>
        <section className="yt-card yt-wide"><h4>5단계 전개</h4>
          <ol className="yt-stages">{(a.stages || []).map((st) => <li key={st.name}><b>{st.name}</b><small>{st.time_range}</small><span>{st.summary}</span></li>)}</ol>
        </section>
        <section className="yt-card"><h4>시청자 반응</h4><p>{s.summary}</p>
          {s.positive != null && <div className="yt-sent"><i style={{ width: `${s.positive}%` }} className="pos" /><i style={{ width: `${s.neutral || 0}%` }} className="neu" /><i style={{ width: `${s.negative || 0}%` }} className="neg" /></div>}
          {s.positive != null && <p className="muted small">긍정 {s.positive}% · 중립 {s.neutral}% · 부정 {s.negative}%</p>}
        </section>
        <section className="yt-card"><h4>내 영상에 적용할 점</h4><ol className="yt-tips">{(a.tips || []).map((t) => <li key={t.title}><b>{t.title}</b><span>{t.summary}</span></li>)}</ol></section>
        <section className="yt-card yt-wide"><h4>채널 벤치마킹</h4>
          <dl className="kv"><dt>포지셔닝</dt><dd>{a.channel_strategy?.positioning}</dd><dt>톤앤매너</dt><dd>{a.channel_strategy?.core_tone}</dd><dt>추천 신규 채널</dt><dd>{a.channel_strategy?.recommended_new_channel_topic}</dd><dt>차별화</dt><dd>{a.channel_strategy?.differentiation_point}</dd></dl>
          {a.channel_strategy?.recommended_new_channel_topic && <button type="button" className="btn-mini" onClick={() => go('channel', { topic: a.channel_strategy.recommended_new_channel_topic })}>이 주제로 채널 세팅 만들기</button>}
        </section>
      </div>
      <Group title="전체 분석 리포트" action={<Copy ctx={ctx} text={a.report_md} />}>
        <div className="panel-box"><Md text={a.report_md} /></div>
      </Group>
      {a.script_lines?.length > 0 && (
        <Group title="말투 참고 대사">
          <div className="panel-box"><pre className="yt-pre">{a.script_lines.join('\n')}</pre></div>
        </Group>
      )}
    </div>
  )
}

/* ── ② 기획 · 나레이션 ── */
function Plan({ ctx, analyses, seed }) {
  const [topic, setTopic] = useState(seed?.topic || '')
  const [ref, setRef] = useState(seed?.analysis ? '__seed' : (analyses[0]?.id || ''))
  const [aspect, setAspect] = useState('9:16')
  const [total, setTotal] = useState(10)
  const [secs, setSecs] = useState(8)
  const [plan, setPlan] = useState(seed?.plan || null)
  const [planId, setPlanId] = useState(seed?.planId || null)
  const r = useRun(ctx)
  const refA = ref === '__seed' ? seed?.analysis : analyses.find((x) => x.id === ref)?.data
  const knowledge = useMemo(() => knowledgeOf(refA), [refA])

  const [progress, setProgress] = useState('')
  const start = () => r.run('제목·설명란을 만드는 중…', async () => {
    const t = topic.trim()
    try {
    const meta = await r.call('plan-meta', { topic: t, knowledge })
    let scenes = [], prevTail = ''
    for (let from = 1; from <= total; from += 8) {
      const to = Math.min(total, from + 7)
      setProgress(`나레이션 쓰는 중… 씬 ${from}~${to} / ${total}`)
      const part = await r.call('plan-scenes', { topic: t, title: meta.recommended.title, knowledge, total, secs, from, to, prevTail })
      scenes = scenes.concat(part.scenes); prevTail = part.scenes.at(-1)?.narration || prevTail
    }
    setProgress('AI 영상·이미지 프롬프트 만드는 중…')
    const chunks = []; for (let i = 0; i < scenes.length; i += 5) chunks.push(scenes.slice(i, i + 5))
    const res = await Promise.all(chunks.map((c, i) => r.call('plan-prompts', { topic: t, title: meta.recommended.title, total, scenes: c, aspect, withThumbnail: i === 0 })))
    const byNum = Object.fromEntries(res.flatMap((x) => x.prompts).map((p) => [p.scene_num, p]))
    const full = {
      topic: t, aspect, secs, total, benchmark: refA ? { title: refA.info?.title, channel: refA.info?.channel, url: refA.url } : null,
      meta, thumbnail: res[0]?.thumbnail, scenes: scenes.map((s) => ({ ...s, ...(byNum[s.scene_num] || {}) })), engine: meta.engine,
    }
    setPlan(full)
    const id = await saveYt(ctx.user, 'plan', meta.recommended.title, full)
    setPlanId(id)
    ctx.say('기획서를 보관함에 저장했어요')
    } finally { setProgress('') }
  })

  if (plan) return <PlanView plan={plan} setPlan={setPlan} planId={planId} ctx={ctx} onNew={() => { setPlan(null); setPlanId(null) }} />
  return (
    <div className="panel-box">
      <label className="field"><span>새 영상 주제</span><input className="inp" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: 미네랄 한 잔으로 시작하는 카페 아침 루틴" /></label>
      <label className="field"><span>벤치마크 영상 (① 분석에서 저장한 것)</span>
        <select className="inp" value={ref} onChange={(e) => setRef(e.target.value)}>
          <option value="">벤치마크 없이 (일반 흥행 공식)</option>
          {seed?.analysis && <option value="__seed">{seed.analysis.info?.title} (방금 분석)</option>}
          {analyses.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </label>
      <div className="row2">
        <div className="field"><span>화면 비율</span><Chips items={[{ k: '9:16', n: '세로 9:16 (쇼츠)' }, { k: '16:9', n: '가로 16:9' }]} value={aspect} onChange={setAspect} /></div>
        <div className="field"><span>씬 길이</span><Chips items={[{ k: 8, n: '8초 (쇼츠)' }, { k: 15, n: '15초 (미드폼)' }, { k: 20, n: '20초 (롱폼)' }]} value={secs} onChange={setSecs} /></div>
      </div>
      <div className="field"><span>씬 개수 · 총 길이 약 {Math.round((total * secs) / 6) / 10}분</span><Chips items={[6, 8, 10, 15, 20, 30].map((n) => ({ k: n, n: `${n}개` }))} value={total} onChange={setTotal} /></div>
      <button type="button" className="btn-primary" disabled={!!r.busy || !topic.trim()} onClick={start}>기획 시작</button>
      <p className="muted small">제목 후보 3개 · 설명란 · 5단계 플롯에 맞춘 {secs}초 씬 나레이션 · Runway/Kling/Veo 영상 프롬프트 · 나노바나나 레드라인 썸네일·첫 프레임 프롬프트를 만들어요. 씬 10개 기준 1~2분 걸려요.</p>
      <Busy text={progress || r.busy} /><Err text={r.err} />
    </div>
  )
}

function knowledgeOf(a) {
  if (!a) return '(벤치마크 영상 없음 — 일반적인 지식·정보 유튜브 흥행 공식을 적용)'
  return [`[벤치마크 영상] ${a.info?.title} — ${a.info?.channel}${a.info?.views ? ` · 조회수 ${a.info.views.toLocaleString('ko-KR')}` : ''}`,
    `[흥행 분석 리포트 발췌]\n${String(a.report_md || '').slice(0, 3500)}`,
    a.script_lines?.length ? `[실제 대사 — 말투·호흡 참고]\n${a.script_lines.join('\n')}` : ''].filter(Boolean).join('\n\n')
}
const bounds = (secs) => [Math.floor(secs * 5.2), Math.floor(secs * 6.6), Math.floor(secs * 8.5)]
const tsec = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s }
const srtTime = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},000` }

export function planMd(p) {
  const m = p.meta
  const L = [`# ${m.recommended.title}`, '', `주제: ${p.topic} · ${p.aspect} · ${p.secs}초 씬 ${p.total}개${p.benchmark ? ` · 벤치마크: ${p.benchmark.title}` : ''}`, '', '## 제목 후보']
  m.titles.forEach((t, i) => L.push(`${i + 1}. **${t.title}** (${t.type}) — ${t.reason}`))
  L.push('', '## 설명란', m.description.summary, '', m.description.insight, '', m.description.cta, '', m.description.hashtags.join(' '))
  if (p.thumbnail) L.push('', '## 썸네일 이미지 프롬프트 (나노바나나)', '```json', JSON.stringify(p.thumbnail, null, 2), '```')
  L.push('', '## 씬별 대본·프롬프트')
  p.scenes.forEach((s) => {
    L.push('', `### 씬 ${s.scene_num} · ${s.time} · ${s.stage}${s.emotion ? ` (${s.emotion})` : ''}`, `**나레이션:** ${s.narration}`)
    if (s.direction) L.push(`연출: ${s.direction}`)
    if (s.video_prompt) L.push('', `영상 프롬프트: ${s.video_prompt}`)
    if (s.guide_ko) L.push(`연출 가이드: ${s.guide_ko}`)
    if (s.image_prompt) L.push('', '첫 프레임 이미지 프롬프트:', '```json', JSON.stringify(s.image_prompt, null, 2), '```')
  })
  return L.join('\n')
}
function planSrt(p) {
  return p.scenes.map((s, i) => { const [a, b] = s.time.split(' ~ ').map(tsec); return `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${s.narration}\n` }).join('\n')
}

function PlanView({ plan, setPlan, planId, ctx, onNew }) {
  const [dirty, setDirty] = useState(false)
  const [playing, setPlaying] = useState(null)
  const stopAll = useRef(false)
  const [lo, hi, max] = bounds(plan.secs)
  const m = plan.meta
  const setScene = (n, patch) => { setPlan({ ...plan, scenes: plan.scenes.map((s) => (s.scene_num === n ? { ...s, ...patch } : s)) }); setDirty(true) }
  const save = async () => { await saveYt(ctx.user, 'plan', m.recommended.title, plan, planId); setDirty(false); ctx.say('고친 기획서를 저장했어요') }
  const playAll = (i = 0) => {
    if (i === 0) stopAll.current = false
    if (stopAll.current || i >= plan.scenes.length) { setPlaying(null); return }
    setPlaying(plan.scenes[i].scene_num)
    if (!speak(plan.scenes[i].narration, () => playAll(i + 1))) { ctx.say('이 브라우저는 음성 읽기를 지원하지 않아요'); setPlaying(null) }
  }
  const stop = () => { stopAll.current = true; window.speechSynthesis?.cancel(); setPlaying(null) }
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const toContent = async () => {
    await saveContent(ctx.user, { channel: 'youtube', title: m.recommended.title, body: `${m.description.summary}\n\n${m.description.insight}\n\n${m.description.cta}\n\n${m.description.hashtags.join(' ')}`, date: addDays(todayStr(), 3), status: 'draft' })
    ctx.say('마케팅 달력에 유튜브 초안으로 넣었어요')
  }
  return (
    <div className="stack">
      <div className="yt-bar">
        <button type="button" className="btn-ghost" onClick={onNew}>＋ 새 기획</button>
        <span className="grow" />
        {dirty && <button type="button" className="btn-primary sm" onClick={save}>고친 내용 저장</button>}
        <button type="button" className="btn-ghost" onClick={() => download(`${safeName(m.recommended.title)}_기획서.md`, planMd(plan), 'text/markdown')}>기획서 .md</button>
        <button type="button" className="btn-ghost" onClick={() => download(`${safeName(m.recommended.title)}_자막.srt`, planSrt(plan), 'text/plain')}>자막 .srt</button>
        <button type="button" className="btn-ghost" onClick={() => download(`${safeName(m.recommended.title)}.json`, JSON.stringify(plan, null, 2), 'application/json')}>.json</button>
        <button type="button" className="btn-primary sm" onClick={() => { const t = toTubeInsight(plan); download(t.fileName, JSON.stringify(t.plan, null, 2), 'application/json'); ctx.say('TubeInsight 폴더의 data\\plans\\ 에 넣어 주세요') }}>TubeInsight용 내보내기</button>
      </div>
      <Group title="제목 후보">
        <div className="list">{m.titles.map((t) => (
          <div key={t.title} className={`yt-title ${t.title === m.recommended.title ? 'is-pick' : ''}`}>
            <span className="pill tone-blue">{t.type}</span><b>{t.title}</b><span className="muted small">{t.reason}</span>
            <span className="yt-title-a"><Copy ctx={ctx} text={t.title} />{t.title !== m.recommended.title && <button type="button" className="btn-mini" onClick={() => { setPlan({ ...plan, meta: { ...m, recommended: { ...m.recommended, title: t.title } } }); setDirty(true) }}>이걸로</button>}</span>
          </div>
        ))}</div>
        <AdWarn text={m.titles.map((t) => t.title).join(' ')} />
      </Group>
      <Group title="설명란" action={<Copy ctx={ctx} text={[m.description.summary, m.description.insight, m.description.cta, m.description.hashtags.join(' ')].filter(Boolean).join('\n\n')} />}>
        <div className="panel-box"><pre className="yt-pre">{[m.description.summary, m.description.insight, m.description.cta, m.description.hashtags.join(' ')].filter(Boolean).join('\n\n')}</pre>
          <AdWarn text={`${m.description.summary} ${m.description.insight}`} />
          <button type="button" className="btn-mini" onClick={toContent}>마케팅 달력에 초안으로 넣기</button>
        </div>
      </Group>
      {plan.thumbnail && (
        <Group title="썸네일 이미지 프롬프트 (나노바나나 레드라인)" action={<Copy ctx={ctx} text={`다음 스펙대로 유튜브 썸네일 이미지를 생성해줘:\n${JSON.stringify(plan.thumbnail, null, 2)}`} />}>
          <div className="panel-box"><p className="muted small">제미나이 앱(나노바나나 프로)에 그대로 붙여 넣으세요. 한글 문구는 따옴표 안의 글자만 들어가요.</p>
            <p className="yt-tags">{plan.thumbnail.text_layer.map((t) => <span key={t.text}>"{t.text}"</span>)}</p>
            <details><summary>프롬프트 보기</summary><pre className="yt-pre">{JSON.stringify(plan.thumbnail, null, 2)}</pre></details>
          </div>
        </Group>
      )}
      <Group title={`씬별 대본 · ${plan.secs}초 × ${plan.total}개 · ${plan.aspect}`} action={playing ? <button type="button" className="btn-mini" onClick={stop}>■ 멈춤</button> : <button type="button" className="btn-mini" onClick={() => playAll(0)}>▶ 전체 듣기</button>}>
        <div className="list yt-scenes">
          {plan.scenes.map((s) => {
            const len = s.narration.length
            return (
              <section key={s.scene_num} className={`yt-scene ${playing === s.scene_num ? 'is-play' : ''}`}>
                <div className="yt-scene-h"><b>씬 {s.scene_num}</b><span className="pill tone-violet">{s.stage}</span><span className="muted small">{s.time}{s.emotion ? ` · ${s.emotion}` : ''}</span>
                  <span className="grow" /><button type="button" className="btn-mini" onClick={() => (playing === s.scene_num ? stop() : (setPlaying(s.scene_num), speak(s.narration, () => setPlaying(null))))}>{playing === s.scene_num ? '■' : '▶ 듣기'}</button></div>
                <textarea className="inp memo" rows={2} value={s.narration} onChange={(e) => setScene(s.scene_num, { narration: e.target.value })} />
                <span className={`small ${len > max ? 'err' : len > hi ? 'hint-t' : 'muted'}`}>{len}자 · {plan.secs}초 기준 {lo}~{hi}자{len > max ? ' — 너무 길어요, 줄여 주세요' : len > hi ? ' — 조금 길어요' : ''}</span>
                <AdWarn text={s.narration} />
                {s.direction && <p className="muted small">연출: {s.direction}</p>}
                {s.video_prompt && <details><summary>AI 영상 프롬프트 (Runway·Kling·Veo)</summary><pre className="yt-pre">{s.video_prompt}</pre>{s.guide_ko && <p className="muted small">{s.guide_ko}</p>}<Copy ctx={ctx} text={s.video_prompt} /></details>}
                {s.image_prompt && <details><summary>첫 프레임 이미지 프롬프트 (나노바나나)</summary><pre className="yt-pre">{JSON.stringify(s.image_prompt, null, 2)}</pre><Copy ctx={ctx} text={`다음 스펙대로 이미지를 생성해줘:\n${JSON.stringify(s.image_prompt, null, 2)}`} /></details>}
              </section>
            )
          })}
        </div>
      </Group>
      <p className="muted small">나레이션 MP3·영상 합성·유튜브 업로드는 PC의 TubeInsight 앱에서 해요. 'TubeInsight용 내보내기'로 받은 파일을 TubeInsight 폴더의 <b>data\plans\</b> 에 넣고 TubeInsight를 새로고침하면 ③ 탭 기획 목록에 나와요. '듣기'는 휴대폰·PC 기본 음성으로 읽어 길이를 확인하는 용도예요.</p>
    </div>
  )
}

/* ── ③ 채널 세팅 ── */
function Channel({ ctx, seed }) {
  const [f, setF] = useState({ topic: seed?.topic || '', lang: '', audioLang: '', persona: 'character', audience: '', tone: '' })
  const [res, setRes] = useState(seed?.channel || null)
  const [id, setId] = useState(seed?.channelId || null)
  const r = useRun(ctx)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const start = () => {
    if (!f.lang) return r.setErr('채널 언어를 골라 주세요. (기본값을 두지 않아요)')
    r.run('채널 이름·핸들·설명·키워드·이미지 프롬프트를 만드는 중… 핸들 중복도 확인해요', async () => {
      const c = await r.call('channel', f)
      setRes(c); setId(await saveYt(ctx.user, 'channel', c.channel_name, c))
      ctx.say('채널 세팅을 보관함에 저장했어요')
    })
  }
  if (res) return <ChannelView c={res} id={id} ctx={ctx} onNew={() => { setRes(null); setId(null) }} />
  return (
    <div className="panel-box">
      <label className="field"><span>채널 주제 (한 줄)</span><input className="inp" value={f.topic} onChange={set('topic')} placeholder="예: 50대를 위한 미네랄 카페 레시피" /></label>
      <div className="field"><span>채널 언어 (필수)</span><Chips items={LANGS.map(([k, n]) => ({ k, n }))} value={f.lang} onChange={set('lang')} /></div>
      <div className="field"><span>영상 음성 언어 (비우면 채널 언어)</span><Chips items={[{ k: '', n: '채널 언어와 같게' }, ...LANGS.map(([k, n]) => ({ k, n }))]} value={f.audioLang} onChange={set('audioLang')} /></div>
      <div className="field"><span>프로필 형태</span><Chips items={[{ k: 'character', n: '캐릭터' }, { k: 'person', n: '실사 인물' }, { k: 'symbol', n: '로고·심볼' }]} value={f.persona} onChange={set('persona')} /></div>
      <div className="row2">
        <label className="field"><span>대상 (선택)</span><input className="inp" value={f.audience} onChange={set('audience')} placeholder="예: 동네 카페 사장님" /></label>
        <label className="field"><span>말투·분위기 (선택)</span><input className="inp" value={f.tone} onChange={set('tone')} placeholder="예: 차분한, 유쾌한" /></label>
      </div>
      <button type="button" className="btn-primary" disabled={!!r.busy || !f.topic.trim()} onClick={start}>채널 세팅 만들기</button>
      <p className="muted small">채널 생성·프로필/배너 업로드·전화 인증은 사람이 직접 해야 해요(API가 없음). 여기서는 붙여 넣을 값과 이미지 프롬프트, 순서표를 모두 만들어 드려요.</p>
      <Busy text={r.busy} /><Err text={r.err} />
    </div>
  )
}

function ChannelView({ c, id, ctx, onNew }) {
  const [hs, setHs] = useState(c.handles)
  const [done, setDone] = useState(c.done || {})
  const r = useRun(ctx)
  const recheck = () => r.run('다시 확인하는 중…', async () => { const x = await r.call('handles', { handles: hs.map((h) => h.handle) }); setHs(x.handles); await saveYt(ctx.user, 'channel', c.channel_name, { ...c, handles: x.handles, done }, id) })
  const toggle = async (i) => { const d = { ...done, [i]: !done[i] }; setDone(d); if (id) await saveYt(ctx.user, 'channel', c.channel_name, { ...c, handles: hs, done: d }, id) }
  const ud = c.upload_defaults
  return (
    <div className="stack">
      <div className="yt-bar"><button type="button" className="btn-ghost" onClick={onNew}>＋ 새 채널 세팅</button><span className="grow" />
        <button type="button" className="btn-ghost" onClick={() => download(`${safeName(c.channel_name)}_채널세팅.json`, JSON.stringify({ ...c, handles: hs }, null, 2), 'application/json')}>.json</button></div>
      <div className="yt-grid">
        <section className="yt-card"><h4>① 채널 이름</h4><p className="yt-big">{c.channel_name}</p><span className="muted small">{c.channel_name.length}자 / 50자</span><Copy ctx={ctx} text={c.channel_name} /></section>
        <section className="yt-card"><h4>② 핸들 후보</h4>
          <ul className="yt-handles">{hs.map((h) => (
            <li key={h.handle}><code>@{h.handle}</code>
              <span className={`pill tone-${h.available ? 'green' : h.available === false ? 'red' : 'gray'}`}>{h.available ? '사용 가능' : h.available === false ? '이미 있음' : '확인 못 함'}</span>
              <a className="link small" href={`https://www.youtube.com/@${h.handle}`} target="_blank" rel="noreferrer">열기</a><Copy ctx={ctx} text={h.handle} /></li>
          ))}</ul>
          <button type="button" className="btn-mini" disabled={!!r.busy} onClick={recheck}>중복 다시 확인</button><Err text={r.err} />
        </section>
        <section className="yt-card yt-wide"><h4>③ 채널 설명 <small className="muted">{c.description.length}/1000자</small></h4><pre className="yt-pre">{c.description}</pre><AdWarn text={c.description} /><Copy ctx={ctx} text={c.description} /></section>
        <section className="yt-card yt-wide"><h4>④ 키워드 <small className="muted">{c.keywords.join(',').length}/500자</small></h4><p className="yt-tags">{c.keywords.map((k) => <span key={k}>{k}</span>)}</p><Copy ctx={ctx} text={c.keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' ')} label="유튜브 형식으로 복사" /></section>
        <section className="yt-card"><h4>⑤ 프로필 이미지 프롬프트 <small className="muted">800×800 정사각</small></h4><pre className="yt-pre">{c.avatar_prompt}</pre><Copy ctx={ctx} text={c.avatar_prompt} /></section>
        <section className="yt-card"><h4>⑥ 배너 이미지 프롬프트 <small className="muted">2048×1152 · 모바일은 가운데 1235×338만 보임</small></h4><pre className="yt-pre">{c.banner_prompt}</pre><Copy ctx={ctx} text={c.banner_prompt} label="글자 포함 복사" />
          {c.banner_prompt_notext && <><pre className="yt-pre">{c.banner_prompt_notext}</pre><Copy ctx={ctx} text={c.banner_prompt_notext} label="글자 없음 복사" /></>}</section>
        <section className="yt-card yt-wide"><h4>⑦ 업로드 기본값</h4>
          <dl className="kv"><dt>제목 틀</dt><dd>{ud.title_template}</dd><dt>카테고리</dt><dd>{({ 27: '교육', 28: '과학기술', 22: '인물·블로그', 26: '하우투·스타일', 24: '엔터테인먼트' })[ud.category_id]} ({ud.category_id})</dd><dt>공개 상태</dt><dd>비공개로 시작 (스튜디오에서 공개)</dd><dt>아동용</dt><dd>아니요</dd><dt>언어</dt><dd>{ud.default_language} · 음성 {ud.default_audio_language}</dd><dt>태그</dt><dd>{ud.tags.join(', ')}</dd></dl>
          <details><summary>설명 틀 보기</summary><pre className="yt-pre">{ud.description_template}</pre><Copy ctx={ctx} text={ud.description_template} /></details>
        </section>
        <section className="yt-card yt-wide"><h4>⑧ 개설 체크리스트 <small className="muted">{Object.values(done).filter(Boolean).length}/{c.setup_steps.length}</small></h4>
          <ol className="yt-steps">{c.setup_steps.map((s, i) => <li key={i}><label className="check"><input type="checkbox" checked={!!done[i]} onChange={() => toggle(i)} /> {s}</label></li>)}</ol>
          <p className="muted small">전화 인증을 안 하면 15분 넘는 영상과 맞춤 썸네일이 잠겨요. 업로드 API는 하루 약 6편까지예요.</p>
        </section>
      </div>
    </div>
  )
}

/* ── ④ SNS 원소스 ── */
const OMNI = [
  { k: 'threads', n: '스레드', cal: 'threads', d: '연속 글(타래)' },
  { k: 'x', n: 'X(트위터)', cal: 'threads', d: '짧은 연속 글' },
  { k: 'instagram', n: '인스타그램', cal: 'instagram', d: '캡션·카드뉴스·해시태그·릴스 훅' },
  { k: 'blog', n: 'SEO 블로그', cal: 'blog', d: '검색 노출용 장문' },
  { k: 'newsletter', n: '이메일 뉴스레터', cal: 'newsletter', d: '제목 A/B·본문' },
]
function Omni({ ctx, items, seed }) {
  const [src, setSrc] = useState('')
  const [topic, setTopic] = useState(seed?.topic || '')
  const [context, setContext] = useState(seed?.context || '')
  const [audience, setAudience] = useState('')
  const [channels, setChannels] = useState(['threads', 'instagram', 'blog', 'newsletter'])
  const [count, setCount] = useState(5)
  const [res, setRes] = useState(seed?.omni || null)
  const r = useRun(ctx)
  const sources = items.filter((x) => x.kind === 'analysis' || x.kind === 'plan')
  const pick = (id) => {
    setSrc(id); const it = sources.find((x) => x.id === id); if (!it) return
    if (it.kind === 'analysis') { setTopic(it.data.info?.title || it.title); setContext(`${it.data.core_message}\n\n${it.data.report_md}`) }
    else { setTopic(it.data.meta.recommended.title); setContext(it.data.scenes.map((s) => s.narration).join('\n')) }
  }
  const toggle = (k) => setChannels((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
  const start = () => r.run(`${channels.length}개 채널 글을 한 번에 쓰는 중… (20~40초)`, async () => {
    const o = await r.call('omni', { topic, context, audience, count, channels })
    setRes(o); await saveYt(ctx.user, 'omni', topic, o)
    ctx.say('보관함에 저장했어요')
  })
  if (res) return <OmniView o={res} ctx={ctx} onNew={() => setRes(null)} />
  const hasThread = channels.includes('threads') || channels.includes('x')
  return (
    <div className="panel-box">
      <label className="field"><span>재료 가져오기 (선택)</span>
        <select className="inp" value={src} onChange={(e) => pick(e.target.value)}>
          <option value="">직접 입력</option>
          {sources.map((x) => <option key={x.id} value={x.id}>[{KIND[x.kind]}] {x.title}</option>)}
        </select>
      </label>
      <label className="field"><span>주제</span><input className="inp" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: 미네랄 카페 레시피 신메뉴" /></label>
      <label className="field"><span>참고 내용 (영상 대본·분석·메모)</span><textarea className="inp memo" rows={5} value={context} maxLength={4000} onChange={(e) => setContext(e.target.value)} /></label>
      <label className="field"><span>타깃 독자 (선택)</span><input className="inp" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="예: 카페 사장님, 건강 관심 40~60대" /></label>
      <div className="field"><span>만들 채널 (여러 개 고르기)</span>
        <div className="yt-checks">{OMNI.map((c) => (
          <label key={c.k} className={`yt-check ${channels.includes(c.k) ? 'on' : ''}`}><input type="checkbox" checked={channels.includes(c.k)} onChange={() => toggle(c.k)} /><b>{c.n}</b><small>{c.d}</small></label>
        ))}</div>
      </div>
      {hasThread && <div className="field"><span>스레드·X 연속 글 개수 (1/5, 2/5 … 처럼 이어지는 글)</span><Chips items={[3, 5, 7, 10].map((n) => ({ k: n, n: `${n}개` }))} value={count} onChange={setCount} /></div>}
      <button type="button" className="btn-primary" disabled={!!r.busy || !topic.trim() || !channels.length} onClick={start}>고른 채널 한 번에 만들기</button>
      <p className="muted small">하나의 재료로 여러 채널 글을 동시에 만들고, 건강식품 광고 기준(효능·질병 표현 금지)을 자동 검사해요. 마음에 드는 글은 마케팅 달력에 초안으로 넣으면 승인 절차를 거쳐 발행돼요.</p>
      <Busy text={r.busy} /><Err text={r.err} />
    </div>
  )
}

function OmniView({ o, ctx, onNew }) {
  const toCal = async (channel, title, body) => { await saveContent(ctx.user, { channel, title, body, date: addDays(todayStr(), 2), status: 'draft' }); ctx.say('마케팅 달력에 초안으로 넣었어요') }
  // 예전 저장본(thread/blog/newsletter) 호환
  const threads = o.threads || o.thread
  const Thread = ({ t, label }) => {
    const text = (t.posts || []).map((p) => p.text).join('\n\n') + (t.hashtags?.length ? `\n\n${t.hashtags.join(' ')}` : '')
    return (
      <Group title={`${label}${t.hook_formula ? ` · ${t.hook_formula}` : ''}`} action={<Copy ctx={ctx} text={text} label="전체 복사" />}>
        {t.error ? <p className="err">{t.error}</p> : (
          <div className="list">{(t.posts || []).map((p) => (
            <div key={p.index} className="yt-post"><span className="muted small">{p.index}/{t.posts.length} · {p.role} · {p.text.length}자</span><pre className="yt-pre">{p.text}</pre><Copy ctx={ctx} text={p.text} /></div>
          ))}
            <button type="button" className="btn-mini" onClick={() => toCal('threads', `[${label}] ${o.topic}`, text)}>마케팅 달력에 초안으로 넣기</button>
          </div>
        )}
      </Group>
    )
  }
  const ig = o.instagram, b = o.blog, n = o.newsletter
  const igText = ig && !ig.error ? `${ig.caption}\n\n${(ig.hashtags || []).join(' ')}` : ''
  return (
    <div className="stack">
      <div className="yt-bar"><button type="button" className="btn-ghost" onClick={onNew}>＋ 새로 만들기</button><span className="grow" /><b className="small">{o.topic}</b></div>
      {o.adIssues?.length > 0 && <p className="card-warn">광고 기준에 걸리는 표현 {o.adIssues.length}개: {o.adIssues.map((i) => i.word).join(', ')} — 달력에 넣은 뒤 고쳐 주세요</p>}
      {threads && <Thread t={threads} label="스레드" />}
      {o.x && <Thread t={o.x} label="X(트위터)" />}
      {ig && (
        <Group title="인스타그램" action={<Copy ctx={ctx} text={igText} label="캡션+해시태그 복사" />}>
          {ig.error ? <p className="err">{ig.error}</p> : (
            <div className="panel-box">
              <pre className="yt-pre">{ig.caption}</pre>
              <p className="yt-tags">{(ig.hashtags || []).map((h) => <span key={h}>{h}</span>)}</p>
              {ig.slides?.length > 0 && <>
                <b className="small">카드뉴스 {ig.slides.length}장</b>
                <ol className="yt-slides">{ig.slides.map((sl, i) => <li key={i}><b>{sl.title}</b><span>{sl.body}</span></li>)}</ol>
                <Copy ctx={ctx} text={ig.slides.map((sl, i) => `${i + 1}. ${sl.title}\n${sl.body}`).join('\n\n')} label="카드뉴스 문구 복사" />
              </>}
              {ig.reels_hook && <details><summary>릴스로 만들 때</summary><p><b>첫 3초:</b> {ig.reels_hook}</p><pre className="yt-pre">{(ig.reels_lines || []).join('\n')}</pre></details>}
              <button type="button" className="btn-mini" onClick={() => toCal('instagram', `[인스타] ${o.topic}`, `${igText}\n\n[카드뉴스]\n${(ig.slides || []).map((sl, i) => `${i + 1}. ${sl.title} — ${sl.body}`).join('\n')}`)}>마케팅 달력에 초안으로 넣기</button>
            </div>
          )}
        </Group>
      )}
      {b && (
        <Group title={`SEO 블로그${b.seo_title ? ` · ${b.seo_title}` : ''}`} action={<Copy ctx={ctx} text={b.body_md} label="본문 복사" />}>
          {b.error ? <p className="err">{b.error}</p> : (
            <div className="panel-box">
              <dl className="kv"><dt>제목</dt><dd>{b.seo_title}</dd><dt>메타 설명</dt><dd>{b.meta_description}</dd><dt>키워드</dt><dd>{(b.keywords || []).join(', ')}</dd></dl>
              <Md text={b.body_md} />
              <button type="button" className="btn-mini" onClick={() => toCal('blog', b.seo_title || o.topic, b.body_md)}>마케팅 달력에 초안으로 넣기</button>
            </div>
          )}
        </Group>
      )}
      {n && (
        <Group title="이메일 뉴스레터" action={<Copy ctx={ctx} text={n.body_md} label="본문 복사" />}>
          {n.error ? <p className="err">{n.error}</p> : (
            <div className="panel-box">
              <dl className="kv"><dt>제목 A</dt><dd>{n.subject_a}</dd><dt>제목 B</dt><dd>{n.subject_b}</dd><dt>미리보기</dt><dd>{n.preheader}</dd><dt>버튼</dt><dd>{n.cta}</dd></dl>
              <Md text={n.body_md} />
              <button type="button" className="btn-mini" onClick={() => toCal('newsletter', n.subject_a || o.topic, n.body_md)}>마케팅 달력에 초안으로 넣기</button>
            </div>
          )}
        </Group>
      )}
    </div>
  )
}

/* ── 보관함 ── */
function Saved({ ctx, items, onOpen }) {
  const [k, setK] = useState('all')
  const shown = items.filter((x) => k === 'all' || x.kind === k)
  return (
    <div className="stack">
      <Chips scroll value={k} onChange={setK} items={[{ k: 'all', n: '전체', c: items.length }, ...Object.entries(KIND).map(([kk, n]) => ({ k: kk, n, c: items.filter((x) => x.kind === kk).length }))]} />
      {shown.length ? <div className="list lead-list">{shown.map((x) => (
        <button type="button" key={x.id} className="card lead-card" style={{ '--sc': { analysis: 'var(--b)', plan: 'var(--v)', channel: 'var(--t)', omni: 'var(--a)' }[x.kind] }} onClick={() => onOpen(x)}>
          <span className="card-h"><b>{x.title || '(제목 없음)'}</b><span className="pill tone-gray">{KIND[x.kind]}</span></span>
          <span className="card-s">{ctx.nameOf(x.by)} · {fmtAgo(x.at)}</span>
        </button>
      ))}</div> : <Empty title="아직 저장한 것이 없어요">영상 분석·기획·채널 세팅·SNS 원소스를 만들면 자동으로 여기에 모여요.</Empty>}
    </div>
  )
}

function SavedView({ item, ctx, go, onBack }) {
  const [sure, setSure] = useState(false)
  const canDel = ctx.isAdmin || item.by === ctx.user.id
  const d = item.data
  return (
    <div className="stack">
      <div className="yt-bar"><button type="button" className="btn-ghost" onClick={onBack}>‹ 보관함</button><span className="grow" />
        {canDel && <button type="button" className="link danger small" onClick={async () => { if (!sure) return setSure(true); await deleteYt(item); ctx.say('지웠어요'); onBack() }}>{sure ? '한 번 더 누르면 삭제' : '삭제'}</button>}</div>
      {item.kind === 'analysis' && <AnalysisView a={d} ctx={ctx} go={go} />}
      {item.kind === 'plan' && <button type="button" className="btn-primary" onClick={() => go('plan', { plan: d, planId: item.id })}>기획서 열기 (대본 고치기·듣기·내려받기)</button>}
      {item.kind === 'plan' && <div className="panel-box"><Md text={planMd(d)} /></div>}
      {item.kind === 'channel' && <ChannelView c={d} id={item.id} ctx={ctx} onNew={onBack} />}
      {item.kind === 'omni' && <OmniView o={d} ctx={ctx} onNew={onBack} />}
    </div>
  )
}
