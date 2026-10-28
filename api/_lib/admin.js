// 서버 전용 Firebase 연결 (에이전트·텔레그램·예약 작업이 Firestore 에 쓰기 위해)
// Vercel 환경 변수 FIREBASE_SERVICE_ACCOUNT 에 서비스 계정 JSON 을 통째로 (또는 base64 로) 넣으세요.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

let _db = null
export function adminReady() { return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || globalThis.__ALFS_FAKE_DB) }
export function db() {
  if (globalThis.__ALFS_FAKE_DB) return globalThis.__ALFS_FAKE_DB // 테스트용 가짜 저장소
  if (_db) return _db
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT 가 없습니다'), { code: 'no-admin' })
  const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  if (!getApps().length) initializeApp({ credential: cert(json) })
  _db = getFirestore()
  return _db
}
export { FieldValue }
export const inc = (v) => (globalThis.__ALFS_FAKE_DB ? { __inc: v } : FieldValue.increment(v))
export const iso = () => new Date().toISOString()

/** 앱에서 온 요청의 로그인 확인 → { uid, member } */
export async function verifyUser(req) {
  const h = String(req.headers.authorization || '')
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  db()
  const verify = globalThis.__ALFS_FAKE_AUTH || ((t) => getAuth().verifyIdToken(t)) // 테스트용 가짜 로그인
  const dec = await verify(token).catch(() => null)
  if (!dec) return null
  const m = await db().collection('members').doc(dec.uid).get()
  if (!m.exists || m.data().role === 'pending') return null
  return { uid: dec.uid, member: { id: dec.uid, ...m.data() } }
}

export const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
export async function getSettings() {
  const s = await db().collection('settings').doc('main').get()
  return { approvalLimit: 20000, briefingTime: '08:30', agents: {}, ...(s.exists ? s.data() : {}) }
}
export const agentOn = (settings, k) => settings.agents?.[k]?.on !== false

/** 에이전트가 한 일 기록 (앱 '에이전트' 화면) */
export async function logRun(agent, title, output = '', extra = {}) {
  try {
    await db().collection('agentRuns').add({ agent, title: String(title).slice(0, 120), output: String(output).slice(0, 1500), at: iso(), status: 'ok', ...extra })
  } catch (e) { console.error('logRun', e) }
}

/** 기록 한 건 + 고객 카드 갱신 (앱의 act() 와 같은 모양) */
export async function serverAct(lead, entry, patch = {}, counters = {}) {
  const d = db()
  const e = JSON.parse(JSON.stringify({ ...entry, at: entry.at || iso() }))
  const up = { ...patch, updatedAt: iso() }
  if (e.by !== 'agent') { up.lastBy = e.by; if (e.text) up.lastText = e.text.slice(0, 120) }
  for (const [k, v] of Object.entries(counters)) up[k] = inc(v)
  const b = d.batch()
  const ref = d.collection('leads').doc(lead.id)
  b.update(ref, up)
  b.set(ref.collection('logs').doc(), e)
  b.set(d.collection('activity').doc(), { leadId: lead.id, leadName: lead.name || '', type: e.type, by: e.by, at: e.at, text: (e.text || '').slice(0, 140), ...(e.status ? { status: e.status } : {}), ...(e.amount ? { amount: e.amount } : {}) })
  await b.commit()
}

export async function membersAll() { return list(await db().collection('members').get()) }
