// 유튜브 스튜디오 — TubeInsight(로컬 앱)의 분석·기획·채널 세팅·원소스 마케팅을 서버 함수로 옮긴 것
// 로컬 앱은 yt-dlp 로 자막을 내려받아 로컬 AI 로 분석했지만, 여기서는 Gemini 가 유튜브 영상을 직접 봅니다.
// 영상 합성(ffmpeg)·나레이션 MP3·유튜브 업로드는 서버 함수(60초 제한)에서 할 수 없어 로컬 앱 몫으로 남깁니다.
import { ask, pickJson, hasGemini } from './ai.js'
import { AD_GUIDE, checkAd } from '../../shared/adRules.js'

// ── 공통 ──
const clip = (v, n) => String(v ?? '').slice(0, n)
const arr = (v) => (Array.isArray(v) ? v : [])
async function askJson(task, p) {
  const r = await ask(task, { ...p, json: true })
  const data = pickJson(r.text)
  if (!data) throw Object.assign(new Error('AI 답을 해석하지 못했어요. 다시 눌러 주세요.'), { code: 'bad-json' })
  return { data, engine: r.engine }
}
const HEALTH_NOTE = (topic) => (/미네랄|오륜|건강|효소|영양|디톡스|면역|혈당|웰니스/.test(topic)
  ? `\n\n[광고 기준 — 건강식품 관련 주제이므로 반드시 지킬 것]\n${AD_GUIDE}` : '')

export function videoId(url) {
  const s = String(url || '').trim()
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/)
  return m ? m[1] : null
}

// ── ① 영상 정보 모으기 (키 없이 oEmbed, YOUTUBE_API_KEY 가 있으면 조회수·댓글까지) ──
async function fetchInfo(id) {
  const info = { id, url: `https://www.youtube.com/watch?v=${id}`, title: '', channel: '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(info.url)}&format=json`)
    if (r.ok) { const j = await r.json(); info.title = j.title || ''; info.channel = j.author_name || '' }
  } catch { /* 없으면 Gemini 가 영상에서 읽음 */ }
  const key = process.env.YOUTUBE_API_KEY
  let comments = []
  if (key) {
    try {
      const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${key}`)).json()
      const it = v.items?.[0]
      if (it) {
        Object.assign(info, {
          title: it.snippet.title, channel: it.snippet.channelTitle, published: it.snippet.publishedAt?.slice(0, 10),
          description: clip(it.snippet.description, 800), duration: it.contentDetails.duration,
          views: Number(it.statistics.viewCount || 0), likes: Number(it.statistics.likeCount || 0), commentCount: Number(it.statistics.commentCount || 0),
        })
      }
      const c = await (await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${id}&maxResults=20&order=relevance&textFormat=plainText&key=${key}`)).json()
      comments = arr(c.items).map((x) => ({ text: clip(x.snippet.topLevelComment.snippet.textDisplay, 160), likes: x.snippet.topLevelComment.snippet.likeCount || 0 }))
    } catch (e) { console.error('yt data api', e.message) }
  }
  return { info, comments }
}

const ANALYSIS_SCHEMA = `{
  "title": "영상 제목 (원문)",
  "channel": "채널 이름",
  "report_md": "마크다운 리포트. ### 1. 제목·훅 구조 / ### 2. 전개 방식 / ### 3. 핵심 메시지 / ### 4. 댓글·시청자 반응 / ### 5. 내 영상에 적용할 점 3가지 (왜 통했나 → 적용 방법 → 바로 쓰는 스크립트 템플릿, 제목 공식은 [빈칸] 템플릿) / ### 6. 채널 벤치마킹과 신규 채널 방향",
  "hook": {"part_a": "제목 앞부분 훅 요소(원문)", "part_b": "제목 뒷부분 훅 요소(원문)", "mechanism": "클릭을 만든 심리 기제 한 문장"},
  "stages": [
    {"name": "도입", "time_range": "00:00~00:40", "summary": "한 줄 요약(20자 내외)"},
    {"name": "갈등", "time_range": "...", "summary": "..."},
    {"name": "난제", "time_range": "...", "summary": "..."},
    {"name": "반전", "time_range": "...", "summary": "..."},
    {"name": "여운", "time_range": "...", "summary": "..."}
  ],
  "core_message": "핵심 메시지 한 문장(60자 내외)",
  "keywords": ["#키워드1", "#키워드2", "#키워드3"],
  "sentiment": {"summary": "시청자 반응 한 줄", "positive": 70, "neutral": 20, "negative": 10},
  "tips": [{"title": "적용 포인트 제목", "summary": "한 줄 설명"}],
  "channel_strategy": {"positioning": "포지셔닝과 타깃(한 줄)", "core_tone": "톤앤매너", "recommended_new_channel_topic": "추천 신규 채널 주제", "differentiation_point": "차별화 핵심"},
  "script_lines": ["[00:05] 말투·호흡을 참고할 실제 대사 한 줄", "... 8~12줄"]
}`

export async function analyze(url) {
  const id = videoId(url)
  if (!id) throw Object.assign(new Error('유튜브 영상 주소를 확인해 주세요. (youtube.com/watch?v=… 또는 youtu.be/… 또는 shorts/…)'), { status: 400 })
  const { info, comments } = await fetchInfo(id)
  const ctx = [
    `[영상 정보] 제목: ${info.title || '(영상에서 확인)'} · 채널: ${info.channel || '(영상에서 확인)'}`,
    info.views != null ? `조회수 ${info.views.toLocaleString('ko-KR')} · 좋아요 ${info.likes.toLocaleString('ko-KR')} · 댓글 ${info.commentCount.toLocaleString('ko-KR')} · 게시 ${info.published} · 길이 ${info.duration}` : '',
    info.description ? `[설명란]\n${info.description}` : '',
    comments.length ? `[상위 댓글]\n${comments.map((c) => `[👍${c.likes}] ${c.text}`).join('\n')}` : '[댓글] 수집 안 됨 — 영상 속 반응·자막 흐름으로 추정하고 "추정"이라고 표시',
  ].filter(Boolean).join('\n\n')
  const system = '당신은 유튜브 콘텐츠 기획 전문가입니다. 실제 영상(화면·나레이션·자막)과 메타데이터·댓글을 근거로 흥행 공식을 분석합니다. 추측은 "추정"이라고 표시하고, 영상에 없는 사실·수치를 지어내지 마세요. 한국어로 답합니다.'
  const text = `${ctx}\n\n위 영상을 끝까지 보고 분석해 주세요. stages 의 time_range 는 영상의 실제 시점으로 적고, script_lines 에는 영상에서 실제로 들린 대사를 시점과 함께 옮겨 적으세요.\n반드시 아래 형식의 JSON 하나만 출력하세요:\n${ANALYSIS_SCHEMA}`
  let r, watched = true
  try {
    if (!hasGemini()) throw new Error('no gemini')
    r = await askJson('video', { system, text, video: info.url, maxTokens: 6000, temperature: 0.5 })
  } catch (e) {
    // 비공개·연령 제한·너무 긴 영상 등 → 메타데이터와 댓글만으로
    watched = false
    console.error('yt analyze video', e.message)
    r = await askJson('yt', { system, text: `${text}\n\n(영상을 직접 볼 수 없어 위 정보만으로 분석합니다. 근거가 부족한 항목은 "정보 부족"이라고 쓰세요.)`, maxTokens: 6000, temperature: 0.5 })
  }
  const d = r.data
  const names = ['도입', '갈등', '난제', '반전', '여운']
  const st = arr(d.stages)
  const sent = d.sentiment || {}
  const num = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null }
  const cs = d.channel_strategy || {}
  return {
    id, url: info.url, thumbnail: info.thumbnail, watched, engine: r.engine,
    info: { ...info, title: info.title || clip(d.title, 120), channel: info.channel || clip(d.channel, 60) },
    comments: comments.slice(0, 15),
    report_md: clip(d.report_md, 12000),
    hook: { part_a: clip(d.hook?.part_a, 60), part_b: clip(d.hook?.part_b, 60), mechanism: clip(d.hook?.mechanism, 200) },
    stages: names.map((n, i) => ({ name: clip(st[i]?.name || n, 8), time_range: clip(st[i]?.time_range, 20), summary: clip(st[i]?.summary, 60) })),
    core_message: clip(d.core_message, 200),
    keywords: arr(d.keywords).map((k) => `#${String(k).replace(/^#/, '')}`.slice(0, 20)).slice(0, 6),
    sentiment: { summary: clip(sent.summary, 200), positive: num(sent.positive), neutral: num(sent.neutral), negative: num(sent.negative) },
    tips: arr(d.tips).filter((t) => t?.title).slice(0, 3).map((t) => ({ title: clip(t.title, 60), summary: clip(t.summary, 200) })),
    channel_strategy: { positioning: clip(cs.positioning, 140), core_tone: clip(cs.core_tone, 80), recommended_new_channel_topic: clip(cs.recommended_new_channel_topic, 120), differentiation_point: clip(cs.differentiation_point, 140) },
    script_lines: arr(d.script_lines).map((x) => clip(x, 160)).slice(0, 14),
  }
}

/** 분석 결과 → 기획에 넘기는 참고 자료 */
export function knowledgeOf(a) {
  if (!a) return '(벤치마크 영상 없음 — 일반적인 지식·다큐 유튜브 흥행 공식을 적용)'
  return [`[벤치마크 영상] ${a.info?.title} — ${a.info?.channel}${a.info?.views ? ` · 조회수 ${a.info.views.toLocaleString('ko-KR')}` : ''}`,
    `[흥행 분석 리포트 발췌]\n${clip(a.report_md, 3500)}`,
    a.script_lines?.length ? `[실제 대사 — 말투·호흡 참고]\n${a.script_lines.join('\n')}` : ''].filter(Boolean).join('\n\n')
}

// ── ② 기획 · 나레이션 ──
const STAGES = [
  ['도입', 'The Setup — 기대를 심고 곧바로 반전으로 시선을 붙잡음'],
  ['갈등', 'The Crisis — 문제의 스케일과 본질을 구체적으로 보여줌'],
  ['난제', 'The Dilemma — 왜 쉽게 해결할 수 없는지 딜레마 제시'],
  ['반전', 'The Response — 역발상 해법과 구체적 근거'],
  ['여운', 'The Critique — 통찰과 질문으로 마무리'],
]
export function stagePlan(n) {
  return STAGES.map(([name, desc], k) => {
    const start = Math.round((k * n) / 5) + 1
    const end = Math.max(start, Math.round(((k + 1) * n) / 5))
    return { name, desc, start, end: Math.min(end, n) }
  })
}
export const narrationBounds = (secs) => [Math.floor(secs * 5.2), Math.floor(secs * 6.6), Math.floor(secs * 8.5)]
const tr = (i, secs) => { const s = (i - 1) * secs, e = i * secs; const f = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; return `${f(s)} ~ ${f(e)}` }

export async function planMeta({ topic, knowledge }) {
  const schema = `{
  "titles": [{"type": "대비형", "title": "제목 후보", "reason": "선정 이유 한 줄"}, {"type": "수치형", "title": "...", "reason": "..."}, {"type": "선언형", "title": "...", "reason": "..."}],
  "recommended": {"title": "최종 추천 제목", "reason": "추천 이유"},
  "description": {"summary": "호기심을 끄는 3줄 줄거리(줄바꿈 포함)", "insight": "핵심 시사점", "cta": "구독·알림 유도 문구", "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"]}
}`
  const { data: d, engine } = await askJson('yt', {
    system: '당신은 유튜브 지식·다큐·정보 콘텐츠 기획자입니다. 한국어로 답합니다.',
    text: `아래 벤치마크 영상의 흥행 공식(제목 훅 구조, 전개 방식, 시청자 반응 포인트)을 새 주제에 적용해 제목과 설명란을 기획해 주세요.\n\n[벤치마크 분석]\n${knowledge}\n\n[새 영상 주제]\n"${topic}"${HEALTH_NOTE(topic)}\n\n제목 후보 3개는 서로 다른 훅 유형(대비형 / 수치형 / 선언형)으로, 사실이 아닌 수치를 지어내지 마세요.\n반드시 아래 형식의 JSON 하나만 출력하세요:\n${schema}`,
    maxTokens: 2000, temperature: 0.75,
  })
  const titles = arr(d.titles).filter((t) => t?.title).slice(0, 3).map((t) => ({ type: clip(t.type, 10), title: clip(t.title, 80), reason: clip(t.reason, 200) }))
  if (!titles.length) titles.push({ type: '기본', title: clip(topic, 80), reason: 'AI 답을 해석하지 못해 주제를 그대로 사용' })
  const desc = d.description || {}
  return {
    engine,
    titles,
    recommended: { title: clip(d.recommended?.title || titles[0].title, 80), reason: clip(d.recommended?.reason, 300) },
    description: { summary: clip(desc.summary, 600), insight: clip(desc.insight, 400), cta: clip(desc.cta, 200), hashtags: arr(desc.hashtags).map((h) => `#${String(h).replace(/^#/, '')}`.slice(0, 20)).slice(0, 8) },
  }
}

export async function planScenes({ topic, title, knowledge, total, secs, from, to, prevTail }) {
  const plan = stagePlan(total)
  const [lo, hi] = narrationBounds(secs)
  const sent = secs <= 10 ? '한 문장' : secs <= 16 ? '2문장' : '2~3문장'
  const stageLines = plan.map((s) => `- 씬 ${s.start}${s.end !== s.start ? `~${s.end}` : ''} (${tr(s.start, secs).split(' ~ ')[0]} ~ ${tr(s.end, secs).split(' ~ ')[1]}): ${s.name} — ${s.desc}`).join('\n')
  const schema = `{"scenes": [{"scene_num": ${from}, "stage": "도입", "emotion": "핵심 감정/역할", "narration": "${secs}초 안에 읽히는 ${sent} (${lo}~${hi}자)", "direction": "자막·연출 의도 한 줄"}]}`
  const { data: d, engine } = await askJson('yt', {
    system: '당신은 유튜브 나레이션 작가입니다. 한국어로 씁니다.',
    text: `영상 제목은 "${title}"입니다. 이 영상을 ${secs}초 씬 ${total}개(총 약 ${Math.round((total * secs) / 60)}분)로 만듭니다. 이번에는 씬 ${from}~${to}만 작성하세요.\n\n[벤치마크 말투·구조 참고]\n${clip(knowledge, 2500)}\n\n[주제] "${topic}"${HEALTH_NOTE(topic)}\n\n[5단계 플롯 배분 — 반드시 이 구간대로]\n${stageLines}\n${prevTail ? `\n[바로 앞 씬의 나레이션 — 자연스럽게 이어서]\n"${prevTail}"\n` : ''}\n규칙:\n- scene_num 은 ${from}부터 ${to}까지 빠짐없이\n- narration 은 ${lo}~${hi}자 ${sent} (${secs}초 안에 읽혀야 함). ${hi + 5}자를 넘기지 말 것\n- 앞 씬과 자연스럽게 이어지고, 구체적 대비·질문으로 시청 유지\n- 사실이 아닌 수치를 지어내지 말 것. 불확실하면 "약", "추정"으로\n- 맞춤법·띄어쓰기를 정확히\n\n반드시 아래 형식의 JSON 하나만 출력하세요:\n${schema}`,
    maxTokens: 3000, temperature: 0.75,
  })
  const items = arr(d.scenes).filter((x) => x && typeof x === 'object')
  const out = []
  for (let n = from; n <= to; n++) {
    const it = items.find((x) => Number(x.scene_num) === n) || items[n - from] || {}
    const stage = plan.find((s) => n >= s.start && n <= s.end)?.name || ''
    const narration = clip(it.narration, hi + 40).trim()
    out.push({ scene_num: n, time: tr(n, secs), stage: clip(it.stage || stage, 8), emotion: clip(it.emotion, 40), narration, direction: clip(it.direction, 160), ok: !!it.narration })
  }
  return { scenes: out, engine }
}

const REDLINE_STYLE = {
  base: 'realistic 3D render, miniature diorama, matte materials, soft studio lighting, soft ambient occlusion',
  figures: 'faceless white mannequin workers in white protective suits',
  annotation: 'thin red engineering-diagram overlay, single red color, technical manual aesthetic',
}
const REDLINE_RULES = ['모든 텍스트는 정확한 철자로', '지정한 텍스트 외 어떤 글자도 넣지 말 것', '주석선은 실제 대상을 정확히 가리킬 것']
function redline(block, aspect, thumb, fallbackSubject, fallbackText) {
  const b = block && typeof block === 'object' ? block : {}
  const text = arr(b.text_layer).filter((t) => t?.text).slice(0, thumb ? 3 : 1).map((t) => ({ text: clip(t.text, 12), position: thumb ? clip(t.position || 'center', 30) : 'top', font: 'bold Korean gothic', color: clip(t.color || (thumb ? 'red' : 'white'), 12), size: clip(t.size || 'large', 10) }))
  if (thumb && !text.length && fallbackText) text.push({ text: clip(fallbackText, 10), position: 'center', font: 'bold Korean gothic', color: 'red', size: 'large' })
  return {
    format: { aspect_ratio: aspect, resolution: '2K' },
    style: REDLINE_STYLE,
    scene: { subject: clip(b.scene?.subject || fallbackSubject, 300), view: clip(b.scene?.view || (thumb ? 'cutaway cross-section, slightly elevated' : 'isometric 45°, detailed view'), 80) },
    annotation_layer: arr(b.annotation_layer).filter((x) => x && typeof x === 'object').slice(0, 6).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clip(v, 60)]))),
    text_layer: text,
    constraints: REDLINE_RULES,
  }
}

export async function planPrompts({ topic, scenes, aspect, withThumbnail }) {
  const arGuide = aspect === '9:16' ? 'vertical 9:16 composition, subject centered on the vertical axis, leave headroom for on-screen captions' : 'wide 16:9 cinematic composition'
  const list = scenes.map((s) => `- Scene ${s.scene_num} [${s.stage}]: "${s.narration}"`).join('\n')
  const schema = `{
  ${withThumbnail ? `"thumbnail": {"scene": {"subject": "썸네일 피사체·상황 (한국어)", "view": "cutaway cross-section / isometric 45 / aerial view"}, "annotation_layer": [{"type": "leader_line", "style": "red dotted, end dot", "target": "대상", "label": "10자 이내"}], "text_layer": [{"text": "훅 문구 10자 이내", "position": "center", "color": "red", "size": "large"}]},` : ''}
  "scenes": [{"scene_num": ${scenes[0].scene_num},
    "visual_prompt": "English, 40-70 words, photorealistic cinematic description of what is on screen",
    "camera": "camera movement & angle (English)", "lighting": "lighting & atmosphere (English)",
    "sfx": "physical sound effects & ambience only (English)", "guide_ko": "한국어 연출 가이드 한 줄",
    "image": {"scene": {"subject": "첫 프레임 피사체 (한국어)", "view": "isometric 45 / slightly elevated"}, "annotation_layer": [{"type": "leader_line", "style": "red dotted, end dot", "target": "대상", "label": "라벨"}], "text_layer": [{"text": "핵심 단어 1개 또는 빈 배열", "position": "top"}]}}]
}`
  const { data: d, engine } = await askJson('yt', {
    system: 'You are a prompt designer for AI video tools (Runway, Kling, Luma, Sora, Veo) and for Nano Banana (Gemini Image) "red-line engineering annotation" thumbnails. Answer in JSON only.',
    text: `주제 "${topic}"의 씬 ${scenes.length}개에 대해 (1) AI 영상 생성 툴에 붙여 넣을 영문 프롬프트와 (2) 나노바나나 레드라인 스타일 첫 프레임 이미지 설계${withThumbnail ? ', (3) 썸네일 1장 설계' : ''}를 만들어 주세요.\n\n[씬별 나레이션]\n${list}\n\n[화면 비율] ${aspect} — ${arGuide}\n\n규칙:\n- visual_prompt 에는 화면 속 글자·자막·로고를 넣지 말 것 (no on-screen text). 인물은 말하지 않는 모습 (silent, closed mouths)\n- sfx 에 사람 목소리·대사·음악·BGM 금지, 현장 효과음·앰비언스만\n- image: 3D 디오라마 + 빨간 점선 리더선·치수선 주석. text_layer 는 최대 1개, 위치는 top (하단은 자막 자리)\n- 썸네일: 텍스트 2~3개, 문구당 10자 이내 한국어, 굵은 고딕\n- 수치는 나레이션에 실제로 나온 값만 (지어내기 금지)\n- scene_num 은 ${scenes[0].scene_num}부터 ${scenes[scenes.length - 1].scene_num}까지 빠짐없이\n\n반드시 아래 형식의 JSON 하나만 출력하세요:\n${schema}`,
    maxTokens: 5000, temperature: 0.6,
  })
  const items = arr(d.scenes).filter((x) => x && typeof x === 'object')
  const out = scenes.map((s, i) => {
    const it = items.find((x) => Number(x.scene_num) === s.scene_num) || items[i] || {}
    const vp = clip(it.visual_prompt, 700) || `${topic}, cinematic documentary shot illustrating: ${s.narration}`
    const cam = clip(it.camera, 120), light = clip(it.lighting, 120), sfx = clip(it.sfx, 160)
    return {
      scene_num: s.scene_num,
      video_prompt: [vp, cam && `Camera: ${cam}.`, light && `Lighting: ${light}.`, arGuide + '.', 'No on-screen text, no subtitles, no logos. Silent characters.', sfx && `SFX: ${sfx}.`].filter(Boolean).join(' '),
      guide_ko: clip(it.guide_ko, 160),
      image_prompt: redline(it.image, aspect, false, `${topic} — 씬 ${s.scene_num}: ${s.narration}`, ''),
      ok: !!it.visual_prompt,
    }
  })
  return { prompts: out, thumbnail: withThumbnail ? redline(d.thumbnail, aspect, true, `${topic}의 핵심 상황`, clip(topic, 10)) : null, engine }
}

// ── ③ 채널 세팅 (명세: 유튜브 채널 세팅 자동 생성.md) ──
const CATS = [27, 28, 22, 26, 24]
export async function channel({ topic, lang, audioLang, persona = 'character', audience = '', tone = '' }) {
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(lang || ''))) throw Object.assign(new Error('채널 언어를 골라 주세요.'), { status: 400 })
  const schema = `{
  "channel_name": "채널 이름 (${lang}, 50자 이내, 한글이면 8자 안팎)",
  "handles": ["영문 소문자 핸들 후보 5개 — 로마자 표기 / 뜻을 옮긴 영어 / 짧은 조합"],
  "description": "채널 설명 (${lang}, 1000자 이내). 첫 두 줄 = 누구를 위한 무슨 채널. 한 줄 정의 → 누구에게 도움 → 업로드 주기 → 연락처·링크",
  "keywords": ["넓은 키워드와 좁은 키워드 섞어 8~15개 (${lang})"],
  "avatar_prompt": "English. square profile image: simple solid background, single subject centered, subject fills 60%+ of frame, no small text",
  "banner_prompt": "English. 16:9 channel banner: all text and key elements inside the central horizontal safe band (mobile shows only the center 1235x338), left/right edges background only, generous top/bottom margins. Banner text (if any) in quotes, one short line",
  "banner_prompt_notext": "English. same banner with no text at all",
  "upload_defaults": {"title_template": "{주제} — {한 줄 요약}", "description_template": "고정 소개문과 링크 (5000자 이내)", "tags": ["태그"], "category_id": 27},
  "setup_steps": ["사람이 직접 할 일, 순서대로"]
}`
  const personaN = { character: '캐릭터', person: '실사 인물', symbol: '로고·심볼' }[persona] || '캐릭터'
  const { data: d, engine } = await askJson('yt', {
    system: '당신은 유튜브 채널 브랜딩 전문가입니다. 채널 개설에 필요한 값을 정확한 규격으로 만듭니다.',
    text: `주제: "${topic}"\n채널 언어(lang): ${lang}\n영상 음성 언어: ${audioLang || lang}\n대상: ${audience || '(주제에서 추론)'}\n말투·분위기: ${tone || '(주제에 맞게)'}\n프로필 형태: ${personaN}${HEALTH_NOTE(topic)}\n\n규칙:\n- 채널 이름·설명·키워드·업로드 기본값·체크리스트는 모두 ${lang} 언어로\n- 핸들은 언제나 영문 소문자·숫자·밑줄·하이픈·마침표만, 3~30자\n- 이미지 프롬프트 문장은 언제나 영어. 배너 글자는 ${lang} 원문을 따옴표로 넣되, 한국어·일본어·중국어면 아주 짧게\n- category_id: 27 교육 / 28 과학기술 / 22 인물·블로그 / 26 하우투·스타일 / 24 엔터테인먼트\n- setup_steps 에는 채널 만들기 → 이름·핸들 → 프로필 → 배너 → 전화 인증(안 하면 15분 초과 영상·맞춤 썸네일 잠김) → 국가·키워드 → 업로드 기본값 → (선택) 신분증 인증 순서를 포함\n\n반드시 아래 형식의 JSON 하나만 출력하세요:\n${schema}`,
    maxTokens: 3500, temperature: 0.7,
  })
  const handles = [...new Set(arr(d.handles).map((h) => String(h).toLowerCase().replace(/^@/, '').trim()).filter((h) => /^[a-z0-9._-]{3,30}$/.test(h)))].slice(0, 6)
  let kw = arr(d.keywords).map((k) => clip(k, 40)).filter(Boolean).slice(0, 15)
  while (kw.join(',').length > 500) kw = kw.slice(0, -1)
  const ud = d.upload_defaults || {}
  let tags = arr(ud.tags).map((t) => clip(t, 40)).filter(Boolean)
  while (tags.join(',').length > 500) tags = tags.slice(0, -1)
  return {
    engine, topic, lang, audio_lang: audioLang || lang, persona,
    channel_name: clip(d.channel_name, 50),
    handles: await checkHandles(handles),
    description: clip(d.description, 1000),
    keywords: kw,
    avatar_prompt: clip(d.avatar_prompt, 900), banner_prompt: clip(d.banner_prompt, 1200), banner_prompt_notext: clip(d.banner_prompt_notext, 1200),
    upload_defaults: {
      title_template: clip(ud.title_template, 120), description_template: clip(ud.description_template, 5000), tags,
      category_id: CATS.includes(Number(ud.category_id)) ? Number(ud.category_id) : 27,
      privacy_status: 'private', made_for_kids: false, default_language: lang, default_audio_language: audioLang || lang,
    },
    setup_steps: arr(d.setup_steps).map((x) => clip(x, 200)).slice(0, 12),
  }
}

/** 핸들 중복 확인: youtube.com/@핸들 이 404 면 사용 가능, 200 이면 이미 있음 */
export async function checkHandles(list) {
  return Promise.all(list.map(async (handle) => {
    try {
      const r = await fetch(`https://www.youtube.com/@${handle}`, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(6000) })
      return { handle, available: r.status === 404 ? true : r.status === 200 ? false : null }
    } catch { return { handle, available: null } }
  }))
}

// ── ④ 원소스 멀티유즈: 스레드·X 타래 / SEO 블로그 / 뉴스레터 ──
export async function omni({ topic, context = '', audience = '', count = 5, platform = 'threads' }) {
  const n = Math.max(3, Math.min(10, Number(count) || 5))
  const base = `주제: ${topic}\n타깃 독자: ${audience || '주제에 맞게'}\n${context ? `\n[참고 — 유튜브 분석 또는 대본]\n${clip(context, 3000)}\n` : ''}${HEALTH_NOTE(topic)}`
  const plat = platform === 'twitter' ? 'X(트위터): 한 줄 펀치라인, 정보 압축, 포스트당 120~240자' : '스레드(Threads): 친근한 구어체, 가독성 좋은 줄바꿈, 이모지 적당히, 포스트당 250~450자'
  const jobs = {
    thread: askJson('draft', {
      system: '당신은 SNS 바이럴 카피라이터입니다. 한국어로 씁니다.',
      text: `${base}\n\n${n}개 포스트로 이어지는 타래를 써 주세요. 1번은 스크롤을 멈추게 하는 훅, 2~${n - 1}번은 핵심 인사이트·방법, ${n}번은 3줄 요약 + 저장·팔로우·댓글 유도 + 해시태그. 형식: ${plat}. 각 포스트는 "1/${n}"처럼 번호로 시작.\nJSON 하나만: {"hook_formula": "적용한 훅 공식", "summary": "한 줄 요약", "hashtags": ["#태그"], "posts": [{"index": 1, "role": "hook", "text": "..."}]}`,
      maxTokens: 3000, temperature: 0.8,
    }),
    blog: askJson('draft', {
      system: '당신은 네이버·구글 검색 상위 노출을 노리는 SEO 블로그 작가입니다. 한국어로 씁니다.',
      text: `${base}\n\n검색 최적화 블로그 글을 써 주세요. H1 1개, H2 3~5개(각 아래 H3 가능), 본문 1500~2500자, 결론과 행동 유도. 핵심 키워드를 제목·첫 문단·소제목에 자연스럽게.\nJSON 하나만: {"seo_title": "60자 이내", "meta_description": "150자 이내", "keywords": ["키워드"], "slug": "english-slug", "body_md": "# H1 ... 마크다운 본문"}`,
      maxTokens: 4500, temperature: 0.7,
    }),
    newsletter: askJson('draft', {
      system: '당신은 이메일 뉴스레터 카피라이터입니다. 한국어로 씁니다.',
      text: `${base}\n\n새 영상·콘텐츠를 알리는 이메일 뉴스레터를 써 주세요. 제목 A/B 두 가지, 미리보기 문구, 인사 → 핵심 3가지 → 행동 유도 버튼 문구 → 맺음말.\nJSON 하나만: {"subject_a": "...", "subject_b": "...", "preheader": "...", "body_md": "마크다운 본문", "cta": "버튼 문구"}`,
      maxTokens: 2500, temperature: 0.7,
    }),
  }
  const keys = Object.keys(jobs)
  const settled = await Promise.allSettled(Object.values(jobs))
  const out = { topic }
  settled.forEach((s, i) => { out[keys[i]] = s.status === 'fulfilled' ? s.value.data : { error: s.reason?.message || '실패' }; if (s.status === 'fulfilled') out.engine = s.value.engine })
  if (out.thread?.posts) out.thread.posts = arr(out.thread.posts).slice(0, n).map((p, i) => ({ index: i + 1, role: clip(p.role, 10), text: clip(p.text, 900) }))
  const all = [out.thread?.posts?.map((p) => p.text).join(' '), out.blog?.body_md, out.newsletter?.body_md].filter(Boolean).join(' ')
  out.adIssues = checkAd(all)
  return out
}
