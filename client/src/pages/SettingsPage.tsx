import { useState } from 'react';
import { PageLayout } from '../components/common/PageLayout';
import { SettingsContent } from '../features/settings/SettingsContent';
import { useSettingsPage } from '../features/settings/useSettingsPage';
import { SettingsTab } from '../features/settings/types';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const settingsPage = useSettingsPage();

  return (
    <PageLayout
      sidebar={null}
      header={settingsPage.header}
      tabs={{ value: activeTab, tabs: settingsPage.tabs, onChange: setActiveTab }}
    >
      <SettingsContent activeTab={activeTab} {...settingsPage.controller} />
    </PageLayout>
  );
}
