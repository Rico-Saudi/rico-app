import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A handful of frontend page routes share a path prefix with real API
// routes (e.g. page GET /business/login vs. API POST /business/login).
// The backend's SpaController (src/spa/spa.controller.ts) handles this
// collision in production by explicitly serving index.html for these
// exact GET paths. Mirror that here: bypass the proxy for them so Vite's
// own dev server serves the SPA shell instead of forwarding to Nest,
// which would 404 (client/dist isn't built in dev).
const FRONTEND_PAGE_PATHS = new Set([
  '/submit-deal',
  '/business/login',
  '/business/dashboard',
  '/admin/dashboard',
]);

function bypassFrontendPages(req) {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && FRONTEND_PAGE_PATHS.has(path)) {
    return req.url;
  }
}

// Dev server proxies API calls to the Express backend on :3000 so
// `npm run dev` here works against a locally running rico-backend without
// CORS friction. In production, Express serves this app's build output
// directly (same origin, no proxy needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/search': 'http://localhost:3000',
      '/deals': 'http://localhost:3000',
      '/classify': 'http://localhost:3000',
      '/places': 'http://localhost:3000',
      '/submit-deal': { target: 'http://localhost:3000', bypass: bypassFrontendPages },
      '/business': { target: 'http://localhost:3000', changeOrigin: true, bypass: bypassFrontendPages },
      '/admin': { target: 'http://localhost:3000', bypass: bypassFrontendPages },
    },
  },
});
