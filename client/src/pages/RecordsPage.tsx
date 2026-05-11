import { PageLayout } from '../components/common/PageLayout';
import { RecordsContent } from '../features/records/RecordsContent';
import { useRecordsPage } from '../features/records/useRecordsPage';

export default function RecordsPage() {
  const recordsPage = useRecordsPage();

  return (
    <PageLayout
      sidebar={recordsPage.sidebar}
      header={recordsPage.header}
    >
      <RecordsContent {...recordsPage.contentProps} />
    </PageLayout>
  );
}
