// 알프스 워크 저장소
// Firebase 모드 (Firestore)
//   members/{uid}           팀원 { name, email, role, joinedAt, tgChatId?, tgCode? }
//   invites/{email}         미리 등록한 사람 { name, role, by }
//   leads/{id}              고객 카드 (예비샵 → 파트너샵). 역할별 담당 tmId·salesId·managerId, 일정, 미팅 횟수, 계약, partner{}, prep{}
//   leads/{id}/logs/{id}    통화·미팅·계약·메모·주문 기록 (고객별 대화창)
//   activity/{id}           모든 기록의 사본 (팀 소식·주간 리포트·대시보드용)
//   events/{id}             고객 카드 밖 일정 (행사·세미나·기타)
//   expenses/{id}           비용 { uid, date, month, amount, category, pay, memo, status, hasReceipt, via }
//   receipts/{id}           영수증 사진 { img } (작게 줄인 JPEG)
//   contents/{id}           마케팅 글 { channel, title, body, date, status, by, byAgent }
//   agentRuns/{id}          에이전트가 한 일 (서버만 씀)
//   settings/main           { approvalLimit, briefingTime, agents:{k:{on}} }
// 체험 모드(Firebase 값이 없을 때): 이 브라우저 localStorage 에만 저장, 빈 상태로 시작
import {
  collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, limit, setDoc, updateDoc, deleteDoc, writeBatch, increment, deleteField, where,
} from 'firebase/firestore'
import { app, auth, isDemoMode } from './firebase.js'
import { ls } from './safeStorage.js'
import { DEFAULT_APPROVAL_LIMIT } from '../shared/constants.js'

const db = app ? getFirestore(app) : null
const iso = () => new Date().toISOString()
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const demo = isDemoMode

// ── 체험 모드 저장소 ──
const KEY = 'alfs_work_demo_v2'
const listeners = new Set()
const seed = () => ({ leads: {}, logs: {}, members: {}, invites: {}, activity: [], events: {}, expenses: {}, receipts: {}, contents: {}, agentRuns: [], settings: {} })
const load = () => ({ ...seed(), ...(ls.get(KEY) || {}) })
const save = (s) => { ls.set(KEY, s); listeners.forEach((f) => f()) }
const sub = (f) => { listeners.add(f); f(); return () => listeners.delete(f) }
const DELETE = '__delete__'
function applyPatch(obj, patch) {
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.'); let o = obj
    for (const p of parts.slice(0, -1)) o = (o[p] ||= {})
    const last = parts[parts.length - 1]
    if (v === DELETE) delete o[last]; else o[last] = v
  }
}
const del = () => (demo ? DELETE : deleteField())
const snap = (q, cb, onErr) => onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(e); onErr ? onErr(e) : cb([]) })

// ── 팀원 ──
export function watchMyMember(user, cb) {
  if (demo) return sub(() => { const s = load(); if (!s.members[user.id]) { s.members[user.id] = { name: user.name || '나', role: 'admin', email: user.email || '', joinedAt: iso() }; ls.set(KEY, s) } cb({ id: user.id, ...s.members[user.id] }) })
  return onSnapshot(doc(db, 'members', user.id), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), () => cb(null))
}
export function watchMembers(cb) {
  if (demo) return sub(() => cb(Object.entries(load().members).map(([id, v]) => ({ id, ...v }))))
  return snap(collection(db, 'members'), cb)
}
export async function requestJoin(user, name, role = 'pending') {
  const body = { name: name.trim().slice(0, 20), email: user.email || '', role, joinedAt: iso() }
  if (demo) { const s = load(); s.members[user.id] = body; save(s); return }
  await setDoc(doc(db, 'members', user.id), body)
}
const emailKey = (e) => String(e || '').trim().toLowerCase()
export function watchInvites(cb) {
  if (demo) return sub(() => cb(Object.entries(load().invites).map(([email, v]) => ({ email, ...v }))))
  return onSnapshot(collection(db, 'invites'), (q) => cb(q.docs.map((d) => ({ email: d.id, ...d.data() }))), () => cb([]))
}
export async function addInvite(by, { email, name, role, title = '', freelance = false }) {
  const body = { name: name.trim().slice(0, 20), role, title: String(title).trim().slice(0, 20), freelance: !!freelance, by, at: iso() }
  if (demo) { const s = load(); s.invites[emailKey(email)] = body; save(s); return }
  await setDoc(doc(db, 'invites', emailKey(email)), body)
}
export async function removeInvite(email) {
  if (demo) { const s = load(); delete s.invites[emailKey(email)]; save(s); return }
  await deleteDoc(doc(db, 'invites', emailKey(email)))
}
export async function claimInvite(user) {
  const key = emailKey(user.email)
  if (!key) return false
  if (demo) {
    const s = load(); const inv = s.invites[key]; if (!inv) return false
    s.members[user.id] = { name: inv.name || user.name || '팀원', email: user.email, role: inv.role, title: inv.title || '', freelance: !!inv.freelance, joinedAt: iso() }; delete s.invites[key]; save(s); return true
  }
  const ref = doc(db, 'invites', key)
  const inv = await getDoc(ref).catch(() => null)
  if (!inv?.exists()) return false
  const v = inv.data()
  await setDoc(doc(db, 'members', user.id), { name: v.name || user.name || '팀원', email: user.email, role: v.role, title: v.title || '', freelance: !!v.freelance, joinedAt: iso() })
  await deleteDoc(ref).catch(() => {})
  return true
}
export async function setMember(uid, patch) {
  if (demo) { const s = load(); s.members[uid] = { ...s.members[uid], ...patch }; save(s); return }
  await updateDoc(doc(db, 'members', uid), patch)
}
export async function removeMember(uid) {
  if (demo) { const s = load(); delete s.members[uid]; save(s); return }
  await deleteDoc(doc(db, 'members', uid))
}

// ── 고객 ──
export function watchLeads(cb, onError) {
  if (demo) return sub(() => cb(Object.values(load().leads)))
  return snap(query(collection(db, 'leads'), orderBy('updatedAt', 'desc'), limit(1500)), cb, onError)
}
export function watchLogs(leadId, cb) {
  if (demo) return sub(() => cb([...(load().logs[leadId] || [])].sort((a, b) => a.at.localeCompare(b.at))))
  return snap(query(collection(db, 'leads', leadId, 'logs'), orderBy('at', 'asc'), limit(500)), cb)
}
export function watchActivity(cb, n = 300) {
  if (demo) return sub(() => cb([...load().activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n)))
  return snap(query(collection(db, 'activity'), orderBy('at', 'desc'), limit(n)), cb)
}
const actRow = (lead, entry) => ({ leadId: lead.id, leadName: lead.name || '', type: entry.type, by: entry.by, at: entry.at, text: (entry.text || '').slice(0, 140), ...(entry.status ? { status: entry.status } : {}), ...(entry.amount ? { amount: entry.amount } : {}) })

export async function createLead(user, data) {
  const id = newId()
  const lead = {
    ...data, stage: data.stage || 'new', tmId: data.tmId ?? user.id, salesId: data.salesId || null, managerId: data.managerId || null, createdBy: user.id,
    meetings: 0, calls: 0, manages: 0, nextCall: null, nextManage: null, appt: null, apptAck: false, contract: null, checks: {},
    createdAt: iso(), updatedAt: iso(), lastText: data.memo || '고객 등록', lastBy: user.id,
  }
  delete lead.memo
  const log = { type: 'create', by: user.id, at: iso(), text: data.memo || '' }
  if (demo) { const s = load(); s.leads[id] = { id, ...lead }; s.logs[id] = [{ id: newId(), ...log }]; s.activity.push({ id: newId(), ...actRow({ id, ...lead }, log) }); save(s); return id }
  const b = writeBatch(db)
  b.set(doc(db, 'leads', id), lead)
  b.set(doc(collection(db, 'leads', id, 'logs')), log)
  b.set(doc(collection(db, 'activity')), actRow({ id, ...lead }, log))
  await b.commit()
  return id
}

/** 기록 한 건을 남기면서 고객 카드도 함께 바꿈. counters: { calls: 1 } */
export async function act(user, lead, log, patch = {}, counters = {}) {
  const entry = JSON.parse(JSON.stringify({ ...log, by: user.id, at: iso() }))
  const summary = { updatedAt: iso(), lastBy: user.id }
  if (log.text) summary.lastText = log.text.slice(0, 120)
  if (demo) {
    const s = load(); const l = s.leads[lead.id]; if (!l) return
    applyPatch(l, { ...patch, ...summary })
    for (const [k, v] of Object.entries(counters)) l[k] = (l[k] || 0) + v
    ;(s.logs[lead.id] ||= []).push({ id: newId(), ...entry }); s.activity.push({ id: newId(), ...actRow(lead, entry) }); save(s); return
  }
  const b = writeBatch(db)
  const up = { ...patch, ...summary }
  for (const [k, v] of Object.entries(counters)) up[k] = increment(v)
  b.update(doc(db, 'leads', lead.id), up)
  b.set(doc(collection(db, 'leads', lead.id, 'logs')), entry)
  b.set(doc(collection(db, 'activity')), actRow(lead, entry))
  await b.commit()
}
export async function editLead(lead, patch) {
  if (demo) { const s = load(); applyPatch(s.leads[lead.id], { ...patch, updatedAt: iso() }); save(s); return }
  await updateDoc(doc(db, 'leads', lead.id), { ...patch, updatedAt: iso() })
}
export async function deleteLead(lead) {
  if (demo) { const s = load(); delete s.leads[lead.id]; delete s.logs[lead.id]; save(s); return }
  await deleteDoc(doc(db, 'leads', lead.id))
}
export async function setCheck(user, lead, key, on, info) {
  const path = `checks.${key}`
  if (on) return act(user, lead, { type: 'check', ...info }, { [path]: { by: user.id, at: iso() } })
  return editLead(lead, { [path]: del() })
}

// ── 일정 (고객 카드 밖) ──
export function watchEvents(cb) {
  if (demo) return sub(() => cb(Object.values(load().events)))
  return snap(query(collection(db, 'events'), orderBy('at', 'desc'), limit(500)), cb)
}
export async function saveEvent(user, ev) {
  const id = ev.id || newId()
  const body = { title: ev.title, at: ev.at, place: ev.place || '', who: ev.who || 'all', note: ev.note || '', createdBy: ev.createdBy || user.id, updatedAt: iso(), done: ev.done || null }
  if (demo) { const s = load(); s.events[id] = { id, ...body }; save(s); return id }
  await setDoc(doc(db, 'events', id), body)
  return id
}
export async function setEventDone(user, ev, on) {
  const done = on ? { by: user.id, at: iso() } : null
  if (demo) { const s = load(); if (s.events[ev.id]) s.events[ev.id].done = done; save(s); return }
  await updateDoc(doc(db, 'events', ev.id), { done })
}
export async function deleteEvent(ev) {
  if (demo) { const s = load(); delete s.events[ev.id]; save(s); return }
  await deleteDoc(doc(db, 'events', ev.id))
}

// ── 비용 ──
/** uid 를 주면 그 사람 것만, null 이면 전체(대표) */
export function watchExpenses(uid, cb, onError) {
  if (demo) return sub(() => cb(Object.values(load().expenses).filter((e) => !uid || e.uid === uid)))
  const q = uid ? query(collection(db, 'expenses'), where('uid', '==', uid), limit(1000)) : query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(2000))
  return snap(q, cb, onError)
}
export async function addExpense(user, item, img, approvalLimit) {
  const id = newId()
  const auto = item.amount < approvalLimit
  const row = { ...item, uid: user.id, status: auto ? 'approved' : 'pending', autoApproved: auto, hasReceipt: !!img, via: 'app', createdAt: iso() }
  if (demo) { const s = load(); s.expenses[id] = { id, ...row }; if (img) s.receipts[id] = img; save(s); return { id, ...row } }
  if (img) await setDoc(doc(db, 'receipts', id), { img, uid: user.id })
  await setDoc(doc(db, 'expenses', id), row)
  return { id, ...row }
}
export async function setExpenseStatus(user, it, status) {
  const patch = { status, decidedBy: user.id, decidedAt: iso() }
  if (demo) { const s = load(); if (s.expenses[it.id]) Object.assign(s.expenses[it.id], patch); save(s); return }
  await updateDoc(doc(db, 'expenses', it.id), patch)
}
export async function removeExpense(it) {
  if (demo) { const s = load(); delete s.expenses[it.id]; delete s.receipts[it.id]; save(s); return }
  await deleteDoc(doc(db, 'expenses', it.id))
  if (it.hasReceipt) await deleteDoc(doc(db, 'receipts', it.id)).catch(() => {})
}
export async function getReceipt(it) {
  if (demo) return load().receipts[it.id] || null
  const s = await getDoc(doc(db, 'receipts', it.id))
  return s.exists() ? s.data().img : null
}

// ── 마케팅 콘텐츠 ──
export function watchContents(cb) {
  if (demo) return sub(() => cb(Object.values(load().contents)))
  return snap(query(collection(db, 'contents'), orderBy('date', 'desc'), limit(300)), cb)
}
export async function saveContent(user, c) {
  const id = c.id || newId()
  const body = { channel: c.channel, title: c.title, body: c.body, date: c.date, status: c.status || 'draft', by: c.by || user.id, byAgent: !!c.byAgent, updatedAt: iso(), ...(c.url ? { url: c.url } : {}) }
  if (demo) { const s = load(); s.contents[id] = { id, ...body }; save(s); return id }
  await setDoc(doc(db, 'contents', id), body)
  return id
}
export async function deleteContent(c) {
  if (demo) { const s = load(); delete s.contents[c.id]; save(s); return }
  await deleteDoc(doc(db, 'contents', c.id))
}

// ── 에이전트 기록·설정 ──
export function watchAgentRuns(cb, n = 60) {
  if (demo) return sub(() => cb([...load().agentRuns].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n)))
  return snap(query(collection(db, 'agentRuns'), orderBy('at', 'desc'), limit(n)), cb)
}
export function watchSettings(cb) {
  const fill = (v = {}) => ({ approvalLimit: DEFAULT_APPROVAL_LIMIT, briefingTime: '08:30', agents: {}, ...v })
  if (demo) return sub(() => cb(fill(load().settings)))
  return onSnapshot(doc(db, 'settings', 'main'), (d) => cb(fill(d.exists() ? d.data() : {})), () => cb(fill()))
}
export async function saveSettings(patch) {
  if (demo) { const s = load(); applyPatch(s.settings, patch); save(s); return }
  await setDoc(doc(db, 'settings', 'main'), patch, { merge: true })
}

// ── 서버(에이전트) 호출 ──
// 체험 모드나 서버 미연결이면 { offline: true } 를 돌려줍니다 → 화면이 알아서 안내
export async function callAgent(action, payload = {}) {
  if (demo) return { offline: true, reason: '체험 모드에서는 AI 에이전트가 돌지 않아요. Firebase와 서버 설정 후 동작합니다.' }
  try {
    const token = await auth.currentUser?.getIdToken()
    const r = await fetch('/api/app', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) })
    const j = await r.json().catch(() => ({}))
    if (r.status === 501) return { offline: true, reason: j.error || '서버 설정이 아직 끝나지 않았어요.' }
    if (!r.ok) return { error: j.error || '에이전트가 응답하지 않았어요. 잠시 후 다시 눌러 주세요.' }
    return j
  } catch { return { error: '네트워크가 불안정해요. 다시 눌러 주세요.' } }
}
// 영수증 읽기는 로그인 토큰과 함께 /api/app 으로
export const readReceipt = (image) => callAgent('receipt', { image })

// ── 이전 '일괄 정산 앱' 데이터 가져오기 (대표, 한 번만) ──
// 같은 Firebase 프로젝트의 claims/{uid}/items → expenses 로 복사합니다. 이미 옮긴 건은 건너뜁니다.
export async function importOldExpenses() {
  if (demo) return { moved: 0, skipped: 0 }
  const { getDocs } = await import('firebase/firestore')
  const people = await getDocs(collection(db, 'claims'))
  let moved = 0, skipped = 0
  for (const p of people.docs) {
    const items = await getDocs(collection(db, 'claims', p.id, 'items'))
    for (const it of items.docs) {
      const ref = doc(db, 'expenses', it.id)
      if ((await getDoc(ref)).exists()) { skipped++; continue }
      const v = it.data()
      if (v.hasReceipt) {
        const r = await getDoc(doc(db, 'claims', p.id, 'receipts', it.id)).catch(() => null)
        if (r?.exists()) await setDoc(doc(db, 'receipts', it.id), { img: r.data().img, uid: p.id })
      }
      await setDoc(ref, { ...v, uid: p.id, via: v.via || 'old-app' })
      moved++
    }
  }
  return { moved, skipped }
}
