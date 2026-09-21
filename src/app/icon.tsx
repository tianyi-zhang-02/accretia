import { ImageResponse } from 'next/og';

/**
 * 32×32 favicon — used in browser tabs and other small contexts.
 * Larger PWA-install icons live in icon1.tsx (192) and icon2.tsx (512).
 */

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0b0b0c',
        color: '#f4f4f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 600,
        fontFamily: 'sans-serif',
      }}
    >
      W
    </div>,
    { ...size },
  );
}
