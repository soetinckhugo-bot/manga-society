import { LegalPage } from '@/components/legal/legal-page';

export default function MentionsLegalesPage({
  params,
}: PageProps<'/[locale]/mentions-legales'>) {
  return <LegalPage pageKey="mentions" params={params} />;
}
