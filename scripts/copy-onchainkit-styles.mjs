/**
 * Copy OnchainKit's compiled stylesheet into /public so the browser loads it
 * with a plain <link>, outside the Tailwind/PostCSS pipeline.
 *
 * Why: OnchainKit 1.x ships CSS built with Tailwind v4 (@layer base, @property).
 * Our design system is on Tailwind v3, and its PostCSS plugin rejects that file
 * with "`@layer base` is used but no matching `@tailwind base` directive".
 * Copying instead of importing keeps both stylesheets intact.
 *
 * Runs automatically before dev and before build, so it can never go stale.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = require.resolve('@coinbase/onchainkit/styles.css');

mkdirSync('public', { recursive: true });
copyFileSync(src, 'public/onchainkit.css');
console.log('[defier] copied OnchainKit styles to public/onchainkit.css');
