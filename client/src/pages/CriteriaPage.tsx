import { PageLayout } from '../components/common/PageLayout';
import { CriteriaContent } from '../features/criteria/CriteriaContent';
import { useCriteriaPage } from '../features/criteria/useCriteriaPage';

export default function CriteriaPage() {
  const criteriaPage = useCriteriaPage();

  return (
    <PageLayout
      sidebar={criteriaPage.sidebar}
      header={criteriaPage.header}
    >
      <CriteriaContent {...criteriaPage.contentProps} />
    </PageLayout>
  );
}
