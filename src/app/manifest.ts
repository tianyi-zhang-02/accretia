import type { MetadataRoute } from 'next';

/**
 * Web app manifest, generated at build time. The icons referenced here
 * (/icon, /apple-icon) are also generated at build time via the icon.tsx /
 * apple-icon.tsx file conventions, so the URLs resolve without us
 * shipping binary PNGs in the repo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Work Optional',
    short_name: 'Work Optional',
    description:
      'Log three numbers a month, see whether you’re on track, and find out when work becomes optional. Everything stays on your device.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    categories: ['finance', 'productivity'],
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    icons: [
      { src: '/icon1', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon1', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    // Long-press the icon (Android, desktop): jump straight to an action.
    // iOS doesn't offer web-app shortcuts. Handled by `?go=` in the shell.
    shortcuts: [
      {
        name: 'Log a month · 记一笔',
        short_name: 'Log',
        url: '/?go=log',
        icons: [{ src: '/icon1', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Plan · 规划',
        short_name: 'Plan',
        url: '/?go=plan',
        icons: [{ src: '/icon1', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Backup & sync · 数据',
        short_name: 'Data',
        url: '/?go=data',
        icons: [{ src: '/icon1', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
