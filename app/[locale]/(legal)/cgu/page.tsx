import { LegalPage } from '@/components/legal/legal-page';

export default function CguPage({ params }: PageProps<'/[locale]/cgu'>) {
  return <LegalPage pageKey="cgu" params={params} />;
}
