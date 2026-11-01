// POST /api/youtube — 마케팅 > 유튜브 스튜디오 (로그인한 팀원만)
//   analyze · plan-meta · plan-scenes · plan-prompts · channel · handles · omni
// 결과 저장은 화면(Firestore 'yt' 모음)이 합니다. 여기서는 만들기만.
import { adminReady, verifyUser, logRun } from './_lib/admin.js'
import { hasAI } from './_lib/ai.js'
import { analyze, planMeta, planScenes, planPrompts, channel, checkHandles, omni } from './_lib/yt.js'

const s = (v, n = 400) => String(v ?? '').slice(0, n)

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST만 받습니다.' }) }
  if (!adminReady()) return res.status(501).json({ error: '서버 설정(FIREBASE_SERVICE_ACCOUNT)이 아직 없어요.' })
  const who = await verifyUser(req).catch((e) => ({ fail: String(e?.message || e) }))
  if (!who?.uid) return res.status(401).json({ error: who?.fail || '로그인이 필요해요.' })
  if (!hasAI()) return res.status(501).json({ error: 'AI 키(ANTHROPIC_API_KEY 또는 GEMINI_API_KEY)가 아직 없어요.' })
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const name = who.member.name
  try {
    switch (b.action) {
      case 'analyze': {
        const r = await analyze(s(b.url, 300))
        await logRun('marketing', `유튜브 분석 · ${s(r.info.title, 60)}`, `${name} 요청 · ${r.watched ? '영상 직접 시청' : '정보·댓글만으로 분석'}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      case 'plan-meta':
        return res.json(await planMeta({ topic: s(b.topic, 200), knowledge: s(b.knowledge, 6000) }))
      case 'plan-scenes': {
        const total = Math.max(3, Math.min(40, Number(b.total) || 10))
        const secs = [8, 15, 20].includes(Number(b.secs)) ? Number(b.secs) : 8
        const from = Math.max(1, Number(b.from) || 1), to = Math.min(total, Number(b.to) || total)
        return res.json(await planScenes({ topic: s(b.topic, 200), title: s(b.title, 120), knowledge: s(b.knowledge, 6000), total, secs, from, to, prevTail: s(b.prevTail, 300) }))
      }
      case 'plan-prompts': {
        const scenes = (Array.isArray(b.scenes) ? b.scenes : []).slice(0, 10).map((x) => ({ scene_num: Number(x.scene_num), stage: s(x.stage, 8), narration: s(x.narration, 300) }))
        if (!scenes.length) return res.status(400).json({ error: '씬이 없어요.' })
        const r = await planPrompts({ topic: s(b.topic, 200), scenes, aspect: b.aspect === '9:16' ? '9:16' : '16:9', withThumbnail: !!b.withThumbnail })
        if (b.withThumbnail) await logRun('marketing', `유튜브 기획 · ${s(b.title || b.topic, 60)}`, `${name} 요청 · 씬 ${b.total || scenes.length}개 · ${b.aspect === '9:16' ? '쇼츠 9:16' : '가로 16:9'}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      case 'channel': {
        const r = await channel({ topic: s(b.topic, 200), lang: s(b.lang, 20), audioLang: s(b.audioLang, 20), persona: s(b.persona, 20), audience: s(b.audience, 200), tone: s(b.tone, 100) })
        await logRun('marketing', `유튜브 채널 세팅 · ${r.channel_name}`, `${name} 요청 · ${s(b.topic, 80)}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      case 'handles': {
        const list = (Array.isArray(b.handles) ? b.handles : []).map((h) => String(h).toLowerCase().replace(/^@/, '').trim()).filter((h) => /^[a-z0-9._-]{3,30}$/.test(h)).slice(0, 8)
        return res.json({ handles: await checkHandles(list) })
      }
      case 'omni': {
        const r = await omni({ topic: s(b.topic, 200), context: s(b.context, 4000), audience: s(b.audience, 200), count: b.count, platform: b.platform === 'twitter' ? 'twitter' : 'threads' })
        await logRun('marketing', `원소스 마케팅 · ${s(b.topic, 60)}`, `${name} 요청 · 스레드·블로그·뉴스레터${r.adIssues?.length ? ` · 고칠 표현 ${r.adIssues.map((i) => i.word).join(', ')}` : ''}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      default:
        return res.status(400).json({ error: '알 수 없는 요청이에요.' })
    }
  } catch (e) {
    console.error('youtube', b.action, e)
    return res.status(e.status || 500).json({ error: e.status ? e.message : e.code === 'bad-json' ? e.message : `AI가 답하지 못했어요. 잠시 후 다시 눌러 주세요. (${s(e.message, 160)})` })
  }
}
