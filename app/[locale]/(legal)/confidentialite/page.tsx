import { LegalPage } from '@/components/legal/legal-page';

export default function ConfidentialitePage({
  params,
}: PageProps<'/[locale]/confidentialite'>) {
  return <LegalPage pageKey="privacy" params={params} />;
}
