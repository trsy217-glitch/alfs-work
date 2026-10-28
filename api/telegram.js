// POST /api/telegram — 텔레그램 봇(알프스 비서) 웹훅
// 팀원이 보내는 것: /start 코드(연결) · 글 메모 · 음성 메모 · 영수증 사진 · '오늘'
// 버튼: 메모 저장/취소 · 비용 승인/반려 · 미팅 배정 확인
import { adminReady, db, iso, getSettings, agentOn, logRun, serverAct, membersAll } from './_lib/admin.js'
import { ask, hasAI } from './_lib/ai.js'
import { send, edit, answer, typing, download, esc, appUrl } from './_lib/tg.js'
import { readReceipt, saveExpense, askApproval, parseMemo, proposalText, applyProposal, notifyAck } from './_lib/agents.js'
import { sendBriefing } from './_lib/brief.js'
import { EXP_CAT } from '../shared/constants.js'
import { won } from '../shared/time.js'

const HELP = `<b>알프스 비서 사용법</b>
· 통화·미팅 후 메모를 그대로 보내세요 → 발굴 에이전트가 고객 카드로 정리해 '저장' 버튼을 드려요
  예) 망원동 초록카페 김원장 통화, 시음에 관심. 목요일 2시 매장 미팅
· 음성 메모도 돼요 (말로 녹음해서 보내기)
· 영수증 사진을 보내면 정산 에이전트가 금액·항목을 읽어 올려요 (사진 설명에 메모를 적어도 돼요)
· '오늘' 이라고 보내면 오늘 브리핑을 다시 보내드려요`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok')
  if (process.env.TELEGRAM_WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).send('no')
  if (!adminReady()) return res.status(200).send('no admin')
  const u = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  try {
    if (u.callback_query) await onButton(u.callback_query)
    else if (u.message) await onMessage(u.message)
  } catch (e) { console.error('telegram', e) }
  return res.status(200).send('ok')
}

async function memberByChat(chatId) {
  const q = await db().collection('members').where('tgChatId', '==', chatId).limit(1).get()
  return q.empty ? null : { id: q.docs[0].id, ...q.docs[0].data() }
}

async function onMessage(m) {
  const chat = m.chat.id
  const text = (m.text || m.caption || '').trim()

  // 연결: /start 123456
  const start = text.match(/^\/start\s+(\d{6})/)
  if (start) {
    const q = await db().collection('members').where('tgCode', '==', start[1]).limit(1).get()
    if (q.empty) return send(chat, '연결 코드를 찾지 못했어요. 앱 → 팀·설정 → 내 텔레그램에서 새 코드를 만들어 주세요.')
    const doc = q.docs[0]
    if (doc.data().tgCodeAt && Date.now() - new Date(doc.data().tgCodeAt) > 86400e3) return send(chat, '코드가 만료됐어요. 앱에서 새 코드를 만들어 주세요.')
    await doc.ref.update({ tgChatId: chat, tgCode: null, tgLinkedAt: iso() })
    return send(chat, `${esc(doc.data().name)}님, 연결됐어요! 평일 아침 브리핑과 미팅 알림을 여기로 보내드릴게요.\n\n${HELP}`)
  }

  const me = await memberByChat(chat)
  if (!me || me.role === 'pending') return send(chat, '아직 알프스 워크와 연결되지 않은 계정이에요. 앱 → 팀·설정 → 내 텔레그램에서 연결 코드를 받아 <b>/start 코드</b>를 보내 주세요.')
  const settings = await getSettings()

  if (/^\/?(help|도움|도움말|start)$/i.test(text)) return send(chat, HELP)
  if (/^\/?(today|오늘|브리핑)$/i.test(text)) return sendBriefing(me)

  // 영수증 사진
  if (m.photo?.length || (m.document && /^image\//.test(m.document.mime_type || ''))) {
    if (!agentOn(settings, 'finance')) return send(chat, '정산 에이전트가 꺼져 있어요. 앱의 비용 화면에서 올려 주세요.')
    await typing(chat)
    const sizes = m.photo ? [...m.photo].sort((a, b) => b.width - a.width) : [m.document]
    const pickSize = sizes.find((p) => !p.width || p.width <= 1280) || sizes.at(-1)
    let img = await download(pickSize.file_id)
    if (img.data.length > 700_000 && m.photo) { const small = sizes.find((p) => p.width <= 800); if (small) img = await download(small.file_id) }
    if (!hasAI()) return send(chat, 'AI 엔진이 아직 연결되지 않았어요. 앱의 비용 화면에서 직접 입력해 주세요.')
    const r = await readReceipt({ mime: img.mime === 'application/octet-stream' ? 'image/jpeg' : img.mime, data: img.data })
    if (!r.amount) return send(chat, '영수증에서 금액을 읽지 못했어요. 더 밝게 다시 찍거나 앱 → 비용에서 직접 입력해 주세요.', [[{ text: '앱에서 입력', url: appUrl('expenses') }]])
    const dataUrl = img.data.length < 900_000 ? `data:${img.mime === 'application/octet-stream' ? 'image/jpeg' : img.mime};base64,${img.data}` : null
    const exp = await saveExpense(me, r, dataUrl, settings, text)
    const c = EXP_CAT[exp.category]?.n || '기타'
    await logRun('finance', `영수증 · ${c} ${won(exp.amount)}원`, `${me.name} · ${exp.status === 'pending' ? '대표 승인 요청' : '자동 승인'}${exp.memo ? ` · ${exp.memo}` : ''}`, { engine: r.engine, by: me.id })
    if (exp.status === 'pending') await askApproval(exp, me)
    const tail = exp.category === 'entertain' && !text ? '\n접대비는 누구와 썼는지 앱에서 메모를 적어 주세요.' : ''
    return send(chat, `${exp.status === 'pending' ? '⏳' : '✓'} <b>${esc(c)} ${won(exp.amount)}원</b> (${esc(exp.date.slice(5).replace('-', '.'))}) 저장했어요\n${exp.status === 'pending' ? `${won(settings.approvalLimit)}원 이상이라 대표 승인을 요청했어요` : '자동 승인됐어요'}${exp.memo ? `\n메모: ${esc(exp.memo)}` : ''}${tail}`,
      [[{ text: '항목·금액 고치기', url: appUrl('expenses') }]])
  }

  // 음성 메모 → 받아쓰기 → 글 메모와 같은 흐름
  let memo = text
  if (m.voice || m.audio) {
    if (!agentOn(settings, 'scout')) return send(chat, '발굴 에이전트가 꺼져 있어요.')
    await typing(chat)
    const f = m.voice || m.audio
    if ((f.duration || 0) > 300) return send(chat, '5분이 넘는 음성은 받지 못해요. 나눠서 보내 주세요.')
    try {
      const a = await download(f.file_id)
      const { text: t } = await ask('voice', { text: '이 한국어 음성 메모를 그대로 받아 적으세요. 받아 적은 글만 답하세요.', audio: { mime: a.mime.startsWith('audio') ? a.mime : 'audio/ogg', data: a.data }, maxTokens: 1500 })
      memo = t.trim()
      await send(chat, `🎙 받아 적었어요:\n${esc(memo)}`)
    } catch (e) { console.error('voice', e.message); return send(chat, '음성을 받아 적지 못했어요. (Gemini 키가 필요해요) 글로 보내 주세요.') }
  }
  if (!memo) return send(chat, HELP)

  // 글 메모 → 발굴 에이전트가 정리 → 저장 버튼
  if (!agentOn(settings, 'scout')) return send(chat, '발굴 에이전트가 꺼져 있어요. 앱에서 직접 기록해 주세요.')
  if (!hasAI()) return send(chat, 'AI 엔진이 아직 연결되지 않았어요. 앱에서 직접 기록해 주세요.')
  await typing(chat)
  const p = await parseMemo(memo, me)
  const shown = proposalText(p)
  if (!shown) return send(chat, `어느 고객 이야기인지 찾지 못했어요. 매장 이름을 넣어서 다시 보내 주세요.\n\n${HELP.split('\n').slice(1, 3).join('\n')}`)
  const ref = await db().collection('tgPending').add({ uid: me.id, p, at: iso() })
  return send(chat, `${shown}\n\n이대로 저장할까요?`, [[{ text: '저장', data: `p:save:${ref.id}` }, { text: '취소', data: `p:cancel:${ref.id}` }]])
}

async function onButton(q) {
  const chat = q.message?.chat?.id
  const mid = q.message?.message_id
  const [kind, act, id] = String(q.data || '').split(':')
  const me = await memberByChat(chat)
  if (!me) return answer(q.id, '연결된 팀원이 아니에요')

  if (kind === 'p') {
    const ref = db().collection('tgPending').doc(id)
    const s = await ref.get()
    if (!s.exists || s.data().uid !== me.id) return answer(q.id, '이미 처리했거나 시간이 지났어요')
    await ref.delete()
    if (act === 'cancel') { await answer(q.id, '취소했어요'); return edit(chat, mid, '취소했어요. 다시 보내 주세요.') }
    const { lead, assigned } = await applyProposal(s.data().p, me)
    await answer(q.id, '저장했어요')
    const members = await membersAll()
    const who = assigned ? members.find((x) => x.id === assigned) : null
    return edit(chat, mid, `${proposalText(s.data().p)}\n\n✓ <b>저장했어요</b>${s.data().p.appt ? (who ? ` · 미팅을 ${esc(who.name)}님에게 배정${assigned === me.id ? '' : '하고 알렸어요'}` : '\n영업 담당이 정해지지 않았어요. 앱에서 정해 주세요.') : ''}\n${esc(appUrl('leads'))}`)
  }

  if (kind === 'e') {
    if (me.role !== 'admin') return answer(q.id, '대표만 승인할 수 있어요')
    const ref = db().collection('expenses').doc(id)
    const s = await ref.get()
    if (!s.exists) return answer(q.id, '이미 지워진 건이에요')
    if (s.data().status !== 'pending') { await answer(q.id, '이미 처리된 건이에요'); return }
    const status = act === 'ok' ? 'approved' : 'rejected'
    await ref.update({ status, decidedBy: me.id, decidedAt: iso() })
    await answer(q.id, status === 'approved' ? '승인했어요' : '반려했어요')
    const e = s.data()
    const owner = (await membersAll()).find((x) => x.id === e.uid)
    if (owner?.tgChatId && owner.id !== me.id) await send(owner.tgChatId, `${status === 'approved' ? '✓ 승인' : '✕ 반려'} · ${esc(EXP_CAT[e.category]?.n || '기타')} ${won(e.amount)}원 (${esc(e.date)})`)
    return edit(chat, mid, `${q.message.text?.split('\n').slice(0, 3).map(esc).join('\n') || '비용'}\n\n${status === 'approved' ? '✓ <b>승인했어요</b>' : '✕ <b>반려했어요</b>'}`)
  }

  if (kind === 'a' && act === 'ack') {
    const ref = db().collection('leads').doc(id)
    const s = await ref.get()
    if (!s.exists) return answer(q.id, '고객을 찾지 못했어요')
    const l = { id: s.id, ...s.data() }
    if (l.apptAck) return answer(q.id, '이미 확인했어요')
    await serverAct(l, { type: 'ack', by: me.id, via: 'telegram', text: '미팅 확인했습니다' }, { apptAck: true })
    await notifyAck(l.id, me.id)
    await answer(q.id, '확인했어요')
    return edit(chat, mid, `${esc(q.message.text || '')}\n\n✓ <b>확인했어요</b> (TM에게 알렸어요)`)
  }
  return answer(q.id)
}

