import { isValidElement, ReactNode } from 'react';
import { PageHeaderAction } from './PageHeaderActions';
import { PageHeader } from './PageHeader';
import { PageTabs, PageTabsConfig } from './PageTabs';
import { PageTreeSidebar, PageTreeSidebarConfig } from './PageTreeSidebar';
import { TreeNodeLike } from './TreeNodeView';

interface PageLayoutHeader {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode | PageHeaderAction[];
  hideTitle?: boolean;
}

type PageLayoutSidebar<T extends TreeNodeLike<T>> = ReactNode | PageTreeSidebarConfig<T>;

interface PageLayoutProps<T extends TreeNodeLike<T>> {
  sidebar: PageLayoutSidebar<T>;
  header?: PageLayoutHeader | null;
  tabs?: ReactNode | PageTabsConfig<any> | null;
  children: ReactNode;
  className?: string;
  mainClassName?: string;
}

function isSidebarConfig<T extends TreeNodeLike<T>>(sidebar: PageLayoutSidebar<T>): sidebar is PageTreeSidebarConfig<T> {
  return !!sidebar && typeof sidebar === 'object' && !isValidElement(sidebar) && 'title' in sidebar && 'tree' in sidebar;
}

function renderSidebar<T extends TreeNodeLike<T>>(sidebar: PageLayoutSidebar<T>) {
  if (!isSidebarConfig(sidebar)) return sidebar;

  return <PageTreeSidebar config={sidebar} />;
}

function isTabsConfig(tabs: ReactNode | PageTabsConfig<any> | null | undefined): tabs is PageTabsConfig<any> {
  return !!tabs && typeof tabs === 'object' && !isValidElement(tabs) && 'value' in tabs && 'tabs' in tabs && 'onChange' in tabs;
}

function renderTabs(tabs: ReactNode | PageTabsConfig<any> | null | undefined) {
  if (!tabs) return null;
  if (isTabsConfig(tabs)) return <PageTabs value={tabs.value} tabs={tabs.tabs} onChange={tabs.onChange} />;
  return tabs;
}

export function PageLayout<T extends TreeNodeLike<T>>({
  sidebar,
  header,
  tabs,
  children,
  className = '',
  mainClassName = '',
}: PageLayoutProps<T>) {
  return (
    <div className={`flex h-screen overflow-hidden bg-gray-50 ${className}`}>
      {renderSidebar(sidebar)}
      <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${mainClassName}`}>
        {header && (
          <PageHeader
            eyebrow={header.eyebrow}
            title={header.title}
            actions={header.actions}
            hideTitle={header.hideTitle}
          />
        )}
        {renderTabs(tabs)}
        {children}
      </div>
    </div>
  );
}
