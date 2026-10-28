import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 미리보기 빌드(VITE_PREVIEW_SEED=1)에서만 예시 데이터를 먼저 넣습니다
if (import.meta.env.VITE_PREVIEW_SEED) {
  const { seedPreview } = await import('./previewSeed.js')
  seedPreview()
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 홈 화면 앱 설치·빠른 실행용
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
const { default: App } = await import('./App.jsx')
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
