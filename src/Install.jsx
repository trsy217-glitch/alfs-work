import { useEffect, useState } from 'react'
import { ls } from './safeStorage.js'

// 휴대폰·PC에 '앱'으로 설치 (PWA)
// - 안드로이드·PC 크롬/엣지: 설치 버튼 한 번
// - 아이폰·아이패드: 사파리 공유 버튼 → '홈 화면에 추가' 안내
let deferred = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('alfs-install-ready')) })
}
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const inApp = () => /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(navigator.userAgent)

export default function InstallCard({ compact, dismissible }) {
  const [ready, setReady] = useState(!!deferred)
  const [done, setDone] = useState(isStandalone())
  const [hidden, setHidden] = useState(() => dismissible && ls.get('alfs_install_hide'))
  useEffect(() => {
    const f = () => setReady(true)
    const g = () => setDone(true)
    window.addEventListener('alfs-install-ready', f); window.addEventListener('appinstalled', g)
    return () => { window.removeEventListener('alfs-install-ready', f); window.removeEventListener('appinstalled', g) }
  }, [])
  if (done || hidden || import.meta.env.VITE_PREVIEW_SEED) return null
  const ios = isIOS()
  return (
    <section className={`install ${compact ? 'install-compact' : ''}`} aria-label="앱 설치">
      <img src="/icon-192.png" alt="" width="44" height="44" />
      <div className="install-t">
        <b>알프스 워크를 앱으로 설치</b>
        {inApp() ? <span>카카오톡·인스타 안에서는 설치가 안 돼요. 오른쪽 위 메뉴 → '다른 브라우저로 열기'를 눌러 주세요.</span>
          : ready ? <span>홈 화면에 아이콘이 생기고, 한 번 로그인하면 다음부터 바로 열려요.</span>
            : ios ? <span>사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b> → 추가. 한 번 로그인하면 다음부터 바로 열려요.</span>
              : <span>크롬 주소창 오른쪽 <b>설치 아이콘</b> 또는 메뉴(⋮) → <b>앱 설치</b>(홈 화면에 추가)를 눌러 주세요.</span>}
      </div>
      {ready && !inApp() && <button type="button" className="btn-primary install-btn" onClick={async () => { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; setReady(false); if (r?.outcome === 'accepted') setDone(true) }}>설치</button>}
      {dismissible && <button type="button" className="install-x" aria-label="닫기" onClick={() => { ls.set('alfs_install_hide', 1); setHidden(true) }}>×</button>}
    </section>
  )
}
