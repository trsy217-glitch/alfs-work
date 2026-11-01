// 알프스 워크 기획서 → PC용 TubeInsight 기획 파일(data/plans/<plan_id>.json) 변환
// TubeInsight generator.generate_video_content() 가 저장하는 형식과 같게 맞춥니다.
// 받은 .json 을 TubeInsight 폴더의 data\plans\ 에 넣으면 ③ 탭에서 바로 나레이션·합성·업로드.

const SAFE = /[\\/:*?"<>|]/g
const safe = (s, n) => String(s || '').replace(SAFE, '_').trim().slice(0, n) || 'plan'
const pad = (n) => String(n).padStart(2, '0')
const range = (i, secs) => { const s = (i - 1) * secs, e = i * secs; return `${pad(Math.floor(s / 60))}:${pad(s % 60)} ~ ${pad(Math.floor(e / 60))}:${pad(e % 60)}` }
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

function metaMd(meta) {
  const L = ['### 제목 후보']
  meta.titles.forEach((t, i) => L.push(`${i + 1}. **${t.title}** _(${t.type})_ — ${t.reason}`))
  L.push(`\n**✅ 최종 추천:** ${meta.recommended.title}\n\n${meta.recommended.reason || ''}`)
  const d = meta.description
  L.push('\n### 설명란 (Description)\n', d.summary)
  if (d.insight) L.push('\n' + d.insight)
  if (d.cta) L.push('\n' + d.cta)
  if (d.hashtags.length) L.push('\n' + d.hashtags.join(' '))
  return L.join('\n')
}
const descPlain = (d) => [d.summary, d.insight, d.cta, d.hashtags.join(' ')].filter(Boolean).join('\n\n')
const scenesMd = (sc) => ['| 씬 | 시간 | 단계 | 나레이션 | 연출 의도 |', '|---|---|---|---|---|', ...sc.map((s) => `| ${s.scene_num} | ${s.time_range} | ${s.stage} | ${s.subtitle || '(대본 없음)'} | ${s.direction} |`)].join('\n')
const promptsMd = (sc, ar) => [`> 화면 비율 \`${ar}\` · 오디오는 효과음만(보이스·BGM 없음)\n`, ...sc.flatMap((s) => [`#### 씬 ${s.scene_num} (${s.time_range}) — ${s.stage}`, `- 나레이션: "${s.subtitle}"`, `- **Prompt**: ${s.prompt_en}`, ...(s.guide_ko ? [`- 연출 가이드: ${s.guide_ko}`] : []), ''])].join('\n')

/** @returns {{ fileName: string, plan: object }} */
export function toTubeInsight(p, now = new Date()) {
  const secs = Number(p.secs) || 8
  const aspect = p.aspect === '9:16' ? '9:16' : '16:9'
  const meta = {
    titles: (p.meta?.titles || []).map((t) => ({ type: t.type || '', title: t.title || '', reason: t.reason || '' })),
    recommended: { title: p.meta?.recommended?.title || p.topic, reason: p.meta?.recommended?.reason || '' },
    description: {
      summary: p.meta?.description?.summary || '', insight: p.meta?.description?.insight || '',
      cta: p.meta?.description?.cta || '', hashtags: p.meta?.description?.hashtags || [],
    },
  }
  if (!meta.titles.length) meta.titles.push({ type: '기본', title: meta.recommended.title, reason: '' })
  const scenes = (p.scenes || []).map((s, i) => {
    const n = Number(s.scene_num) || i + 1
    const full = String(s.video_prompt || '')
    const img = s.image_prompt && typeof s.image_prompt === 'object' ? s.image_prompt : null
    const sub = String(s.narration || '').replace(/\s+/g, ' ').trim()
    return {
      scene_num: n, time_range: range(n, secs), seconds: secs,
      stage: String(s.stage || '').slice(0, 8), emotion: s.emotion || '',
      subtitle: sub, direction: s.direction || '', parse_ok: !!sub, length_warning: false,
      visual_prompt: full.split(' Camera:')[0], camera: '', lighting: '', sfx: '', guide_ko: s.guide_ko || '',
      prompt_en: full || sub, prompt_ok: !!full,
      ...(img ? { image_prompt_json: img, image_prompt_raw: JSON.stringify(img, null, 2), image_prompt_ok: true } : { image_prompt_ok: false }),
    }
  })
  const topic = p.topic || meta.recommended.title
  const planId = `${safe(topic, 30)}_${stamp(now)}`
  const mText = metaMd(meta), sText = scenesMd(scenes), pText = promptsMd(scenes, aspect)
  const thumbRaw = p.thumbnail ? JSON.stringify(p.thumbnail, null, 2) : ''
  const redline = `> 종횡비 \`${aspect}\` · 해상도 \`2K\`\n\n` + (thumbRaw ? `### 4-1. 썸네일 프롬프트\n\n\`\`\`json\n${thumbRaw}\n\`\`\`\n\n` : '') +
    '### 4-2. 씬별 첫 프레임 프롬프트\n\n' + scenes.filter((s) => s.image_prompt_raw).map((s) => `#### 씬 ${s.scene_num} (${s.time_range})\n- 나레이션: "${s.subtitle}"\n\n\`\`\`json\n${s.image_prompt_raw}\n\`\`\`\n`).join('\n')
  const total = scenes.length * secs
  const full_document = `# 🎬 [${topic}] ${secs}초 씬 기반 유튜브 콘텐츠 기획서\n\n` +
    (p.benchmark?.title ? `> 벤치마크: **${p.benchmark.title}**\n\n` : '') +
    `## 1. 제목 & 설명란\n\n${mText}\n\n---\n\n## 2. ${secs}초 씬별 나레이션 대본 (총 ${scenes.length}씬 · ${total}초)\n\n${sText}\n\n---\n\n` +
    `## 3. 씬별 AI 영상 프롬프트\n\n${pText}\n\n---\n\n## 4. 나노바나나 레드라인 이미지 프롬프트\n\n${redline}`
  const plan = {
    plan_id: planId, topic, aspect_ratio: aspect, num_scenes: scenes.length, scene_seconds: secs,
    reference: p.benchmark?.title ? { title: p.benchmark.title, channel: p.benchmark.channel || '', url: p.benchmark.url || '', view_count: 0 } : null,
    style_guide: null, meta, meta_text: mText, description_plain: descPlain(meta.description),
    scenes_text: sText, prompts_text: pText,
    thumbnail_prompt: p.thumbnail || null, thumbnail_prompt_raw: thumbRaw,
    structured_scenes: scenes, full_document,
    quality: { scenes_parsed: scenes.filter((s) => s.parse_ok).length, prompts_parsed: scenes.filter((s) => s.prompt_ok).length, images_parsed: scenes.filter((s) => s.image_prompt_ok).length, length_warnings: [] },
    raw: {}, llm: { backend: 'alfs-work', model: p.engine || '' },
    source: 'alfs-work', created_at: Math.floor(now.getTime() / 1000),
  }
  return { fileName: `${planId}.json`, plan }
}
