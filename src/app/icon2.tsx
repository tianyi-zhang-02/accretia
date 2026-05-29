import { ImageResponse } from 'next/og';

/** 512×512 PWA install icon — used for the iOS splash and Android maskable. */
export const size = { width: 512, height: 512 };
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
          fontSize: 352,
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
