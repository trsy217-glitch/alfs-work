// Firebase 연결 — Google 계정 로그인(Authentication) + 영업 기록 저장(Firestore)
// .env (또는 Vercel 환경 변수)에 VITE_FIREBASE_* 값을 넣으면 실제 모드로 동작합니다.
// 비어 있으면 '체험 모드'(이 브라우저에만 저장)로 동작합니다. README 참고.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}

const ready = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
export const app = ready ? initializeApp(config) : null

export const auth = app ? getAuth(app) : null
// Firestore 는 src/store.js 에서 씁니다
export const isDemoMode = !app
