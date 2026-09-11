import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

export const metadata: Metadata = legalMetadata('privacy');

export default function PrivacyPage() {
  return <LegalPage slug="privacy" />;
}
