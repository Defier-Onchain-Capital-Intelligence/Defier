import { iconImage } from '@/lib/iconImage';

export const dynamic = 'force-static';

/** 180 square, the size iOS uses when someone adds the app to a home screen. */
export function GET() {
  return iconImage(180);
}
