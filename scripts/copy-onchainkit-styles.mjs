/**
 * Copy OnchainKit's compiled stylesheet into /public so the browser loads it
 * with a plain <link>, outside the Tailwind/PostCSS pipeline.
 *
 * Why: OnchainKit 1.x ships CSS built with Tailwind v4 (@layer base, @property).
 * Our design system is on Tailwind v3, and its PostCSS plugin rejects that file
 * with "`@layer base` is used but no matching `@tailwind base` directive".
 * Copying instead of importing keeps both stylesheets intact.
 *
 * The copy is not verbatim. The file begins with six @import calls to
 * fonts.googleapis.com, so every visitor's browser was contacting Google
 * before it could paint — handing over an IP address on a page whose whole
 * claim is that it collects nothing, to fetch five typefaces this product does
 * not use. Our stack is Inter with a system fallback; OnchainKit's components
 * inherit it. The imports are stripped here rather than in the copied file so
 * the fix survives the next dependency bump, which is exactly when a hand
 * edited public/ asset would quietly get it back.
 *
 * Runs automatically before dev and before build, so it can never go stale.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = require.resolve('@coinbase/onchainkit/styles.css');

const raw = readFileSync(src, 'utf8');
const stripped = raw.replace(/@import\s+(?:url\()?["'][^"']*fonts\.googleapis\.com[^"']*["']\)?\s*;/g, '');
const removed = (raw.match(/fonts\.googleapis\.com/g) || []).length
  - (stripped.match(/fonts\.googleapis\.com/g) || []).length;

mkdirSync('public', { recursive: true });
writeFileSync('public/onchainkit.css', stripped);

if (stripped.includes('fonts.googleapis.com')) {
  // Not fatal, but it means the shape of the import changed and the page is
  // calling Google again. Loud, because the symptom is invisible.
  console.warn('[defier] WARNING: a Google Fonts reference survived in onchainkit.css');
}
console.log(`[defier] copied OnchainKit styles to public/onchainkit.css (${removed} Google Fonts import${removed === 1 ? '' : 's'} removed)`);
