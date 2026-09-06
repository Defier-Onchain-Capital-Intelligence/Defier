import { NextResponse } from 'next/server';
import { runAlertPass } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/check-alerts
 *
 * Guarded by a shared secret, not by obscurity: this endpoint sends messages to
 * real people, so an open URL would be a way to spam them. Without the secret
 * configured it refuses to run at all rather than defaulting to open.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Alerts are not configured.' }, { status: 503 });
  }

  const header = req.headers.get('authorization') || '';
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const appUrl = process.env.APP_URL || 'https://defier-alpha.vercel.app';

  try {
    const result = await runAlertPass(appUrl.replace(/\/$/, ''));
    return NextResponse.json(result);
  } catch (err) {
    console.error('[check-alerts]', err);
    return NextResponse.json({ error: 'Alert pass failed.' }, { status: 500 });
  }
}
