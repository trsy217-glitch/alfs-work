// POST /api/app — 앱 화면에서 부르는 에이전트 (로그인한 팀원만)
//   status · receipt · prep · after-meeting · draft · notify
import { adminReady, db, verifyUser, getSettings, agentOn, logRun } from './_lib/admin.js'
import { hasClaude, hasGemini } from './_lib/ai.js'
import { hasTelegram, send } from './_lib/tg.js'
import { readReceipt, prepFor, draftContent, notifyBooking, notifyAck, notifyContent, askApproval } from './_lib/agents.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST만 받습니다.' }) }
  if (!adminReady()) return res.status(501).json({ error: '서버 설정(FIREBASE_SERVICE_ACCOUNT)이 아직 없어요. README의 연결 순서를 따라 주세요.' })
  const who = await verifyUser(req).catch(() => null)
  if (!who) return res.status(401).json({ error: '로그인이 필요해요.' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const settings = await getSettings()
  const off = (k) => !agentOn(settings, k) && res.status(409).json({ error: '대표가 이 에이전트를 꺼 두었어요.' })

  try {
    switch (body.action) {
      case 'status': {
        const c = await db().collection('system').doc('cron').get()
        return res.json({ claude: hasClaude(), gemini: hasGemini(), telegram: hasTelegram(), cronAt: c.exists ? c.data().lastRun : null })
      }
      case 'receipt': {
        if (off('finance')) return
        const m = String(body.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
        if (!m) return res.status(400).json({ error: '영수증 사진이 필요해요.' })
        if (m[2].length > 3_000_000) return res.status(413).json({ error: '사진이 너무 커요.' })
        const r = await readReceipt({ mime: m[1], data: m[2] })
        await logRun('finance', `영수증 읽기 · ${r.amount ? `${r.amount.toLocaleString('ko-KR')}원` : '금액 못 읽음'}`, `${who.member.name} · 앱에서 올림${r.store ? ` · ${r.store}` : ''}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      case 'prep':
      case 'after-meeting': {
        if (off('sales')) return
        const s = await db().collection('leads').doc(String(body.leadId || '')).get()
        if (!s.exists) return res.status(404).json({ error: '고객을 찾지 못했어요.' })
        if (body.action === 'after-meeting' && !s.data().appt) return res.json({ ok: true, skipped: true })
        const l = await prepFor(s.id)
        return res.json({ ok: true, prep: l.prep })
      }
      case 'draft': {
        if (off('marketing')) return
        const topic = String(body.topic || '').slice(0, 200)
        if (!topic) return res.status(400).json({ error: '주제를 적어 주세요.' })
        const r = await draftContent(topic, body.channel)
        await logRun('marketing', `초안 · ${r.title}`, `${who.member.name} 요청 · ${r.issues.length ? `고칠 표현 ${r.issues.map((i) => i.word).join(', ')}` : '광고 기준 검사 통과'}`, { engine: r.engine, by: who.uid })
        return res.json(r)
      }
      case 'notify': {
        const k = body.kind
        if (k === 'test') {
          if (!who.member.tgChatId) return res.json({ ok: false, reason: '텔레그램이 연결되지 않았어요.' })
          const r = await send(who.member.tgChatId, `✓ ${who.member.name}님, 알프스 워크 알림이 잘 연결됐어요.`)
          return res.json({ ok: !!r.ok, reason: r.description })
        }
        if (k === 'booking') return res.json({ ok: await notifyBooking(String(body.leadId)) })
        if (k === 'ack') return res.json({ ok: await notifyAck(String(body.leadId), who.uid) })
        if (k === 'content') return res.json({ ok: await notifyContent(String(body.title || '').slice(0, 100)) })
        if (k === 'expense') {
          const s = await db().collection('expenses').doc(String(body.id)).get()
          if (!s.exists || s.data().uid !== who.uid || s.data().status !== 'pending') return res.json({ ok: false })
          await askApproval({ id: s.id, ...s.data() }, who.member)
          return res.json({ ok: true })
        }
        return res.status(400).json({ error: '알 수 없는 알림' })
      }
      default:
        return res.status(400).json({ error: '알 수 없는 요청' })
    }
  } catch (e) {
    console.error('app', body.action, e)
    if (e.code === 'no-ai') return res.status(501).json({ error: 'AI 엔진 키(ANTHROPIC_API_KEY 또는 GEMINI_API_KEY)가 아직 없어요.' })
    return res.status(502).json({ error: '에이전트가 일을 마치지 못했어요. 잠시 후 다시 눌러 주세요.' })
  }
}
