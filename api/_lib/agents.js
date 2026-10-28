// 에이전트 7개의 실제 일 — 앱(api/app.js)·텔레그램(api/telegram.js)·예약 작업(api/cron.js)이 함께 씁니다.
import { db, iso, list, logRun, serverAct, membersAll, getSettings, agentOn } from './admin.js'
import { ask, pickJson, hasAI } from './ai.js'
import { send, esc, appUrl, brief } from './tg.js'
import { EXP_CATS, EXP_CAT, CHANNEL, CATEGORIES, OPEN_STAGES, stageLabel } from '../../shared/constants.js'
import { AD_GUIDE, checkAd } from '../../shared/adRules.js'
import { kst, fmtWhen, won, addDays, dayLabel } from '../../shared/time.js'

const WD = ['일', '월', '화', '수', '목', '금', '토']
const nowLine = () => { const n = kst(); return `오늘은 ${n.date} (${WD[n.dow]}요일), 지금 한국 시간 ${n.time}` }

/* ── 정산 에이전트: 영수증 읽기 ── */
export async function readReceipt(image) {
  const prompt = `이 사진은 한국 영수증(카드전표, 주차 영수증, 결제 캡처 화면 등)입니다. 아래 JSON 하나만 답하세요. 설명은 쓰지 마세요.
{"amount": 결제 총액(숫자, 원 단위, 모르면 null), "date": "YYYY-MM-DD" 또는 null, "store": 가게·장소 이름 또는 null, "category": ${EXP_CATS.map((c) => `"${c.k}"`).join(' | ')} | null}
항목 기준: 주유소·톨게이트·택시·대중교통 transport, 주차장 parking, 본인 식사 meal, 거래처 식사·선물 entertain, 샘플·소모품·물품 구입 supplies, 인쇄·현수막·광고 promo, 택배·퀵 shipping, 대관·행사 event, 숙박 lodging.`
  const { text, engine } = await ask('receipt', { text: prompt, image, maxTokens: 300, json: true })
  const j = pickJson(text) || {}
  const amount = Math.round(Number(String(j.amount ?? '').replace(/[^\d.]/g, '')))
  return {
    amount: amount > 0 && amount < 100_000_000 ? amount : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') && j.date <= kst().date ? j.date : null,
    store: j.store ? String(j.store).slice(0, 60) : null,
    category: EXP_CAT[j.category] ? j.category : null,
    engine,
  }
}

/** 텔레그램 영수증 → 비용 1건 저장 (2만원 미만 자동 승인) */
export async function saveExpense(member, r, img, settings, memo = '') {
  const d = db()
  const date = r.date || kst().date
  const auto = r.amount < settings.approvalLimit
  const ref = d.collection('expenses').doc()
  const row = { uid: member.id, date, month: date.slice(0, 7), amount: r.amount, category: r.category || 'etc', pay: 'personal', memo: (memo || r.store || '').slice(0, 60), status: auto ? 'approved' : 'pending', autoApproved: auto, hasReceipt: !!img, via: 'telegram', createdAt: iso() }
  if (img) await d.collection('receipts').doc(ref.id).set({ img, uid: member.id })
  await ref.set(row)
  return { id: ref.id, ...row }
}

/** 2만원 이상 → 대표에게 승인 버튼 */
export async function askApproval(exp, who) {
  const admins = (await membersAll()).filter((m) => m.role === 'admin' && m.tgChatId)
  const c = EXP_CAT[exp.category]?.n || '기타'
  for (const a of admins) {
    await send(a.tgChatId, `<b>비용 승인 요청</b>\n${esc(who.name)} · ${esc(c)} <b>${won(exp.amount)}원</b>\n${esc(exp.date)}${exp.memo ? ` · ${esc(exp.memo)}` : ''}`,
      [[{ text: '승인', data: `e:ok:${exp.id}` }, { text: '반려', data: `e:no:${exp.id}` }], [{ text: '앱에서 보기', url: appUrl('expenses') }]])
  }
}

/* ── 발굴 에이전트: 통화 메모 → 고객 카드 제안 ── */
export async function parseMemo(text, member) {
  const leads = list(await db().collection('leads').orderBy('updatedAt', 'desc').limit(400).get())
  const brief_ = leads.map((l) => `${l.id}\t${l.name}\t${l.region || ''}\t${l.phone ? l.phone.slice(-4) : ''}\t${stageLabel(l)}`).join('\n')
  const prompt = `${nowLine()}. 알프스(오륜미네랄 총판) 영업팀 ${member.name}님이 보낸 메모입니다. 어느 고객(매장)에 대한 무슨 일인지 정리하세요.

메모:
"""${text.slice(0, 2000)}"""

기존 고객 목록 (id, 이름, 지역, 전화 뒷자리, 단계):
${brief_ || '(없음)'}

아래 JSON 하나만 답하세요.
{"kind": "update"(기존 고객) | "new"(새 고객) | "unknown"(고객과 관계없는 말),
 "leadId": 기존 고객이면 목록의 id, 아니면 null,
 "lead": 새 고객이면 {"name": 매장 이름, "person": 원장·담당자 또는 "", "phone": 숫자만 또는 "", "region": 지역 또는 "", "category": ${CATEGORIES.map((c) => `"${c}"`).join(' | ')} | ""}, 아니면 null,
 "event": "call"(통화) | "meeting"(대면 미팅을 다녀옴) | "note"(기타 메모),
 "callResult": "talked" | "callback" | "noanswer" | "reject" | null,
 "nextCall": 다시 연락할 때 "YYYY-MM-DDTHH:MM" 또는 null,
 "appt": 새로 잡은 대면 미팅 {"at": "YYYY-MM-DDTHH:MM", "place": 장소 또는 ""} 또는 null,
 "summary": 메모를 한두 문장으로 정리 (없는 내용 지어내지 말 것)}
날짜는 오늘 기준으로 계산하세요 ('내일 2시' → 내일 14:00). 시간이 없으면 미팅은 14:00, 통화는 10:00으로.`
  const { text: out, engine } = await ask('memo', { text: prompt, maxTokens: 600, json: true })
  const j = pickJson(out)
  if (!j) throw new Error('메모를 정리하지 못했어요')
  const lead = j.leadId ? leads.find((l) => l.id === j.leadId) : null
  if (j.kind === 'update' && !lead) j.kind = j.lead?.name ? 'new' : 'unknown'
  const at = (s) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s || '') ? s : null)
  return {
    kind: j.kind, leadId: lead?.id || null, leadName: lead?.name || j.lead?.name || '',
    lead: j.kind === 'new' ? { name: String(j.lead?.name || '').slice(0, 40), person: String(j.lead?.person || '').slice(0, 20), phone: String(j.lead?.phone || '').replace(/[^\d-]/g, '').slice(0, 20), region: String(j.lead?.region || '').slice(0, 40), category: CATEGORIES.includes(j.lead?.category) ? j.lead.category : '' } : null,
    event: ['call', 'meeting', 'note'].includes(j.event) ? j.event : 'note',
    callResult: ['talked', 'callback', 'noanswer', 'reject'].includes(j.callResult) ? j.callResult : null,
    nextCall: at(j.nextCall), appt: j.appt && at(j.appt.at) ? { at: j.appt.at, place: String(j.appt.place || '').slice(0, 60) } : null,
    summary: String(j.summary || text).slice(0, 500), raw: text.slice(0, 2000), engine,
  }
}

export function proposalText(p) {
  if (p.kind === 'unknown') return null
  const lines = [`<b>${p.kind === 'new' ? '새 고객 등록' : '고객 기록'} · ${esc(p.leadName)}</b>`]
  if (p.kind === 'new') lines.push([p.lead.person, p.lead.phone, p.lead.region, p.lead.category].filter(Boolean).map(esc).join(' · ') || '연락처·지역 없음')
  lines.push(`${{ call: '통화', meeting: '미팅 결과', note: '메모' }[p.event]}${p.callResult ? ` · ${{ talked: '통화 완료', callback: '다시 연락 요청', noanswer: '부재중', reject: '관심 없음' }[p.callResult]}` : ''}`)
  lines.push(esc(p.summary))
  if (p.nextCall) lines.push(`다음 통화 ${esc(fmtWhen(p.nextCall))}`)
  if (p.appt) lines.push(`<b>미팅 예약 ${esc(fmtWhen(p.appt.at))}</b>${p.appt.place ? ` · ${esc(p.appt.place)}` : ''}`)
  return lines.join('\n')
}

/** 저장 버튼을 누르면 실제로 적용 */
export async function applyProposal(p, member) {
  const d = db()
  let lead
  if (p.kind === 'new') {
    const ref = d.collection('leads').doc()
    lead = {
      id: ref.id, ...p.lead, stage: 'new', tmId: ['tm', 'admin'].includes(member.role) ? member.id : null, salesId: member.role === 'sales' ? member.id : null, managerId: null, createdBy: member.id,
      meetings: 0, calls: 0, manages: 0, nextCall: null, nextManage: null, appt: null, apptAck: false, contract: null, checks: {}, createdAt: iso(), updatedAt: iso(), lastText: '고객 등록', lastBy: member.id,
    }
    const { id, ...body } = lead
    await ref.set(body)
    await serverAct(lead, { type: 'create', by: member.id, text: '텔레그램 메모로 등록', via: 'telegram' })
  } else {
    const s = await d.collection('leads').doc(p.leadId).get()
    if (!s.exists) throw new Error('고객을 찾지 못했어요')
    lead = { id: s.id, ...s.data() }
  }
  const entry = { by: member.id, via: 'telegram', text: p.summary }
  if (p.event === 'call') {
    const patch = { nextCall: p.nextCall || null }
    if (lead.stage === 'new') patch.stage = 'called'
    if (p.callResult === 'reject') patch.stage = 'lost'
    await serverAct(lead, { ...entry, type: 'call', result: p.callResult || 'talked', nextCall: p.nextCall || null }, patch, { calls: 1 })
  } else if (p.event === 'meeting') {
    const patch = { stage: p.appt ? 'met' : (lead.stage === 'booked' ? 'met' : lead.stage), appt: p.appt ? { ...p.appt, reminded: false } : null, prep: null }
    if (!lead.salesId) patch.salesId = member.id
    await serverAct(lead, { ...entry, type: 'meet', count: (lead.meetings || 0) + 1, next: p.appt ? 'again' : '', nextLabel: p.appt ? '다시 미팅' : '', apptAt: p.appt?.at || null }, patch, { meetings: 1 })
  } else {
    await serverAct(lead, { ...entry, type: 'tg' })
  }
  let assigned = null
  if (p.appt && p.event !== 'meeting') {
    const salesId = lead.salesId || (member.role === 'sales' ? member.id : null)
    await serverAct(lead, { by: member.id, via: 'telegram', type: 'book', apptAt: p.appt.at, place: p.appt.place, salesId, text: '' },
      { appt: { ...p.appt, reminded: false }, apptAck: salesId === member.id, salesId, nextCall: null, stage: ['new', 'called', 'met', 'hold'].includes(lead.stage) ? 'booked' : lead.stage, prep: null })
    assigned = salesId
    if (salesId && salesId !== member.id) await notifyBooking(lead.id)
  }
  if (p.event === 'meeting' && p.appt) prepFor(lead.id).catch(() => {})
  await logRun('scout', `${p.kind === 'new' ? '새 고객 등록' : '고객 기록'} · ${lead.name}`, p.summary + (p.appt ? `\n미팅 예약 ${fmtWhen(p.appt.at)}` : ''), { leadId: lead.id, engine: p.engine, by: member.id })
  return { lead, assigned }
}

/* ── 영업지원 에이전트: 다음 미팅 준비 ── */
export async function prepFor(leadId) {
  const d = db()
  const s = await d.collection('leads').doc(leadId).get()
  if (!s.exists) throw new Error('고객을 찾지 못했어요')
  const l = { id: s.id, ...s.data() }
  const logs = list(await d.collection('leads').doc(leadId).collection('logs').orderBy('at', 'desc').limit(25).get()).reverse()
  const hist = logs.filter((g) => g.text && g.type !== 'check' && g.type !== 'prep').map((g) => `- ${g.at.slice(0, 10)} [${g.type}] ${g.text.slice(0, 400)}`).join('\n')
  const prompt = `${nowLine()}. 오륜미네랄(뽕잎·누에 원료 액상 미네랄, 기타가공품) 총판 알프스의 영업 담당이 아래 매장과 ${l.stage === 'won' ? '관리 방문' : `${(l.meetings || 0) + 1}번째 대면 미팅`}을 합니다${l.appt?.at ? ` (${fmtWhen(l.appt.at)})` : ''}.
매장: ${l.name} · ${[l.category, l.region, l.person].filter(Boolean).join(' · ')} · 지금 단계 ${stageLabel(l)} · 통화 ${l.calls || 0}회 · 미팅 ${l.meetings || 0}회

지금까지 기록:
${hist || '(기록 없음)'}

아래 세 덩어리로 짧게 정리하세요. 각 줄은 '- '로 시작, 덩어리마다 2~4줄. 기록에 없는 사실은 지어내지 말고, 모르면 '확인 필요'라고 쓰세요.
지난번 이야기
다음 미팅에서 할 이야기
준비할 것

${AD_GUIDE}
위 광고 기준에 걸리는 표현(효능·질병·흡수율·디톡스 등)은 할 이야기에도 쓰지 마세요.`
  const { text, engine } = await ask('prep', { text: prompt, maxTokens: 700 })
  const clean = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim().slice(0, 1500)
  const prep = { text: clean, at: iso(), forAt: l.appt?.at || null, engine }
  await d.collection('leads').doc(leadId).update({ prep })
  await serverAct(l, { type: 'prep', by: 'agent', agent: 'sales', text: '다음 미팅 준비 메모를 만들었어요' })
  await logRun('sales', `다음 미팅 준비 · ${l.name}`, clean, { leadId, engine })
  return { ...l, prep }
}

/* ── 알림 ── */
async function member(id) { if (!id) return null; const s = await db().collection('members').doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null }

export async function notifyBooking(leadId) {
  const s = await db().collection('leads').doc(leadId).get(); if (!s.exists) return false
  const l = { id: s.id, ...s.data() }
  const to = await member(l.salesId); const by = await member(l.lastBy)
  if (!to?.tgChatId || !l.appt) return false
  await send(to.tgChatId, `<b>미팅 배정 · ${esc(l.name)}</b>\n${esc(fmtWhen(l.appt.at))}${l.appt.place ? ` · ${esc(l.appt.place)}` : ''}\n${esc([l.person, l.region, l.category].filter(Boolean).join(' · '))}\n잡은 사람 ${esc(by?.name || '팀원')}${l.lastText ? `\n\n${esc(l.lastText)}` : ''}`,
    [[{ text: '확인했어요', data: `a:ack:${l.id}` }], [{ text: '고객 카드 열기', url: appUrl('leads') }]])
  await logRun('scout', `미팅 배정 알림 · ${l.name}`, `${to.name}에게 ${fmtWhen(l.appt.at)} 미팅 배정`, { leadId })
  return true
}
export async function notifyAck(leadId, byId) {
  const s = await db().collection('leads').doc(leadId).get(); if (!s.exists) return false
  const l = { id: s.id, ...s.data() }
  const pm = await member(l.tmId); const by = await member(byId)
  if (!pm?.tgChatId || pm.id === byId) return false
  await send(pm.tgChatId, `✓ ${esc(by?.name || '영업')}님이 ${esc(l.name)} 미팅(${esc(fmtWhen(l.appt?.at))})을 확인했어요`)
  return true
}
export async function notifyContent(title) {
  const admins = (await membersAll()).filter((m) => m.role === 'admin' && m.tgChatId)
  for (const a of admins) await send(a.tgChatId, `<b>마케팅 글 승인 요청</b>\n${esc(title)}`, [[{ text: '앱에서 보기', url: appUrl('marketing') }]])
  return admins.length > 0
}

/* ── 마케팅 에이전트: 초안 ── */
export async function draftContent(topic, channel) {
  const ch = CHANNEL[channel]?.n || '네이버 블로그'
  const shape = channel === 'instagram' ? '인스타그램 게시글: 첫 줄 훅 1줄, 본문 5~8줄, 해시태그 8개 안팎'
    : channel === 'shop' ? '파트너샵 원장님이 매장 단톡방·POP에 쓸 짧은 안내문 (5~8줄)'
      : '네이버 블로그 글: 제목 앞부분에 검색어, 소제목 3~4개, 1,200~1,800자, [사진: 설명] 자리 3곳, 끝에 https://alfs.kr 링크와 서명 "알프스(ALFS) | 오륜미네랄 총판 · 웰니스 유통"'
  const prompt = `알프스(ALFS, 오륜미네랄 총판) 마케팅 담당으로서 ${ch}에 올릴 글을 한국어로 쓰세요.
주제: ${topic}
형식: ${shape}
말투: 친근하고 담백하게, 과장 없이.

${AD_GUIDE}

아래 JSON 하나만 답하세요: {"title": "...", "body": "..."}`
  const { text, engine } = await ask('draft', { text: prompt, maxTokens: 2000, json: true })
  const j = pickJson(text) || { title: topic, body: text }
  const out = { title: String(j.title || topic).slice(0, 100), body: String(j.body || '').slice(0, 6000), engine }
  out.issues = checkAd(`${out.title}\n${out.body}`)
  return out
}

/** 주 2회 자동 초안 (cron) */
const TOPICS = [
  ['blog', '오륜미네랄 먹는법 — 물에 타서 하루 한 잔, 농도 맞추기'], ['instagram', '오늘의 미네랄카페 레시피: 레몬 에이드에 원액 한 스푼'],
  ['blog', '액상 미네랄 고르기 전에 확인할 5가지 (원료·제조사·식품 유형·먹는 법·습관)'], ['instagram', '출근길 텀블러에 담는 하루 한 잔 습관'],
  ['shop', '파트너샵 매장용: 이번 주 시음 행사 안내문'], ['blog', '알프스 파트너샵 이야기 — 매장 한편에서 시작하는 샵인샵'],
  ['instagram', '단백질 쉐이크에 원액 한 스푼, 운동 후 루틴'], ['blog', '제조사 유디아미네랄과 충북 보은 뽕잎·누에 이야기'],
]
export async function weeklyDraft(n) {
  const [channel, topic] = TOPICS[n % TOPICS.length]
  const r = await draftContent(topic, channel)
  const date = addDays(kst().date, 2)
  await db().collection('contents').add({ channel, title: r.title, body: r.body, date, status: 'draft', by: 'agent', byAgent: true, updatedAt: iso() })
  await logRun('marketing', `초안 · ${r.title}`, r.issues.length ? `고칠 표현 ${r.issues.map((i) => i.word).join(', ')}` : '광고 기준 검사 통과', { engine: r.engine })
  return r
}

export { getSettings, agentOn, hasAI, brief, dayLabel, OPEN_STAGES }
