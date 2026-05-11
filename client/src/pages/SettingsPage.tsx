import { PageLayout } from '../components/common/PageLayout';
import { SettingsContent } from '../features/settings/SettingsContent';
import { useSettingsPage } from '../features/settings/useSettingsPage';

export default function SettingsPage() {
  const settingsPage = useSettingsPage();

  return (
    <PageLayout
      sidebar={null}
      header={settingsPage.header}
      tabs={settingsPage.tabs}
    >
      <SettingsContent {...settingsPage.contentProps} />
    </PageLayout>
  );
}
