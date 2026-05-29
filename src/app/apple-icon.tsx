import { ImageResponse } from 'next/og';

/**
 * 180×180 Apple touch icon — iOS uses this when "Add to Home Screen" is
 * tapped. iOS does not respect the web manifest's icon list for the
 * launcher tile, so this file is mandatory for a proper iOS install.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 128,
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
