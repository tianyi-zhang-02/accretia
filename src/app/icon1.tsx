import { ImageResponse } from 'next/og';

/** 192×192 PWA install icon. */
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0a',
          color: '#d4a574',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 132,
          fontWeight: 600,
          fontFamily: 'serif',
          letterSpacing: '-0.05em',
        }}
      >
        t
      </div>
    ),
    { ...size },
  );
}
