import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut as fbSignOut } from 'firebase/auth'
import { auth, isDemoMode } from './firebase.js'
import { ls } from './safeStorage.js'

// 로그인·회원가입: Firebase Authentication 의 Google 계정 로그인 하나로 처리합니다.
// 처음 Google 로 로그인하면 그 자체가 회원가입입니다.

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const DEMO_SESSION = 'alfs_demo_session'

// 카카오톡·인스타그램 등 앱 안 브라우저에서는 Google 이 로그인을 막습니다.
export const inAppBrowser = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/KAKAOTALK/i.test(ua)) return 'kakao'
  if (/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp|Whale\/.*inapp/i.test(ua)) return 'other'
  return ''
}

// 카카오톡 안 브라우저 → 휴대폰 기본 브라우저로 같은 주소 열기
export const openInExternalBrowser = () => {
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`
}

function friendly(error) {
  const c = error?.code || ''
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return ''
  if (c === 'auth/unauthorized-domain') return '이 주소는 아직 로그인이 허용되지 않았습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 사이트 주소를 추가해 주세요.'
  if (c === 'auth/network-request-failed') return '네트워크가 불안정합니다. 잠시 후 다시 시도해 주세요.'
  if (c === 'auth/operation-not-allowed') return 'Google 로그인이 꺼져 있습니다. Firebase 콘솔 → Authentication → 로그인 방법에서 Google 을 켜 주세요.'
  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

const mapUser = (u) => (u ? { id: u.uid, email: u.email, name: u.displayName || u.email?.split('@')[0], photo: u.photoURL || '' } : null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isDemoMode) { setUser(ls.get(DEMO_SESSION)); setLoading(false); return }
    getRedirectResult(auth).catch((e) => setError(friendly(e)))
    return onAuthStateChanged(auth, (u) => { setUser(mapUser(u)); setLoading(false) })
  }, [])

  const api = useMemo(() => ({
    user,
    loading,
    error,
    demo: isDemoMode,

    async signInWithGoogle() {
      if (isDemoMode) {
        const u = ls.get(DEMO_SESSION) || { id: `demo-${Date.now().toString(36)}`, email: 'demo@alfs.kr', name: '체험 사용자' }
        ls.set(DEMO_SESSION, u); setUser(u)
        return { ok: true }
      }
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      // 아이폰 홈 화면 앱만 페이지 이동 방식 (안드로이드 설치 앱은 이동 방식이 크롬 탭으로 빠져 로그인 정보를 잃음 → 팝업)
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (standalone && ios) { await signInWithRedirect(auth, provider); return { ok: true } }
      try {
        await signInWithPopup(auth, provider)
        return { ok: true }
      } catch (e) {
        // 팝업이 막힌 브라우저는 페이지 이동 방식으로 다시 시도
        if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider)
          return { ok: true }
        }
        const m = friendly(e)
        return m ? { error: m } : { cancelled: true }
      }
    },

    async signOut() {
      if (isDemoMode) { ls.remove(DEMO_SESSION); setUser(null); return }
      await fbSignOut(auth)
    },
  }), [user, loading, error])

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
