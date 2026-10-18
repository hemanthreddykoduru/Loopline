import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const upstream = env.VITE_INSFORGE_BASE_URL?.trim()
  let proxyTarget = null
  try {
    const url = new URL(upstream)
    if (['http:', 'https:'].includes(url.protocol) && url.host) proxyTarget = url.toString().replace(/\/$/, '')
  } catch {
    // The application will show its normal missing/invalid configuration state.
  }

  return {
    base: process.env.GITHUB_ACTIONS ? '/Loopline/' : '/',
    plugins: [react()],
    server: proxyTarget ? {
      proxy: {
        '/insforge': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/insforge/, ''),
          // Keep the httpOnly refresh cookie on whichever local host opened Vite.
          cookieDomainRewrite: '',
        },
      },
    } : undefined,
  }
})
