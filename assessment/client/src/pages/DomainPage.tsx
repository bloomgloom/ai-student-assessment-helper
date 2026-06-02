import { PageLayout } from '../components/common/PageLayout';
import { DomainContent } from '../features/domain/DomainContent';
import { useDomainPage } from '../features/domain/useDomainPage';

export default function DomainPage() {
  const domainPage = useDomainPage();

  return (
    <PageLayout
      sidebar={domainPage.sidebar}
      header={domainPage.header}
      tabs={domainPage.tabs}
    >
      <DomainContent {...domainPage.contentProps} />
    </PageLayout>
  );
}
