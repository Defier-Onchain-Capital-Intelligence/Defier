'use client';
/**
 * The last resort.
 *
 * app/error.tsx catches a page that throws, but it renders inside the root
 * layout, so it cannot help when the layout or the providers are what failed.
 * This one replaces the whole document, which is why it carries its own html
 * and body tags and its own colours rather than any class from our stylesheet:
 * at this point nothing can be assumed to have loaded.
 */
export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string }; reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#08090C', color: '#F7F8FA',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
        padding: '24px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '22rem' }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>DeFier did not load</h1>
          <p style={{ color: '#A2A9B8', fontSize: '0.8125rem', lineHeight: 1.6, marginTop: '0.5rem' }}>
            Something broke before the app could start. Nothing of yours is affected:
            DeFier only reads public onchain data and never holds funds or keys.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.75rem',
              border: '1px solid #23262F', background: '#101218', color: '#F7F8FA',
              fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ color: '#6B7280', fontSize: '0.6875rem', marginTop: '1rem' }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
