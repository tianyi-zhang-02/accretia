import type { MetadataRoute } from 'next';

/**
 * Web app manifest, generated at build time. The icons referenced here
 * (/icon, /apple-icon) are also generated at build time via the icon.tsx /
 * apple-icon.tsx file conventions, so the URLs resolve without us
 * shipping binary PNGs in the repo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wealth Projection Simulator',
    short_name: 'Wealth Sim',
    description: 'Project net worth over time from your own assumptions. Client-side, nothing stored.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon1', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon1', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
