import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 카카오톡·문자 링크 미리보기(OG)는 절대 주소가 필요합니다.
// Vercel 은 배포할 때 VERCEL_PROJECT_PRODUCTION_URL(예: alfs-expense.vercel.app)을 자동으로 넣어 줍니다.
// 직접 도메인을 쓰면 Vercel 환경 변수 SITE_URL=https://내도메인 을 추가하세요.
const siteUrl = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || '').replace(/\/$/, '')

export default defineConfig({
  build: { chunkSizeWarningLimit: 1200, target: 'es2022' },
  plugins: [
    react(),
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
  ],
})
