import { ReactNode } from 'react';
import { AiGenerateBox } from '../../components/common/AiGenerateBox';
import { CriteriaItemSection } from '../../components/common/CriteriaItemSection';

interface DomainCriteriaPromptConfig {
  label: string;
  placeholder: string;
  value: string;
  generating?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onGenerate: () => void;
}

interface DomainCriteriaItemsConfig {
  title: string;
  addLabel: string;
  empty?: ReactNode;
  children: ReactNode;
  generating?: boolean;
  generateDisabled?: boolean;
  onGenerate?: () => void;
  onAdd: () => void;
}

interface DomainCriteriaPanelProps {
  top?: ReactNode;
  prompt: ReactNode | DomainCriteriaPromptConfig;
  items: DomainCriteriaItemsConfig;
}

function isPromptConfig(prompt: ReactNode | DomainCriteriaPromptConfig): prompt is DomainCriteriaPromptConfig {
  return !!prompt && typeof prompt === 'object' && 'label' in prompt && 'onGenerate' in prompt;
}

export function DomainCriteriaPromptView({ prompt }: { prompt: ReactNode | DomainCriteriaPromptConfig }) {
  if (!isPromptConfig(prompt)) return <>{prompt}</>;

  return (
    <AiGenerateBox
      label={prompt.label}
      placeholder={prompt.placeholder}
      value={prompt.value}
      onChange={prompt.onChange}
      onGenerate={prompt.onGenerate}
      generating={prompt.generating}
      disabled={prompt.disabled}
    />
  );
}

export function DomainCriteriaItemsView({ items }: { items: DomainCriteriaItemsConfig }) {
  return (
    <CriteriaItemSection
      title={items.title}
      addLabel={items.addLabel}
      generating={items.generating}
      generateDisabled={items.generateDisabled}
      onGenerate={items.onGenerate}
      onAdd={items.onAdd}
      empty={items.empty}
    >
      {items.children}
    </CriteriaItemSection>
  );
}

export function DomainCriteriaPanel({ top, prompt, items }: DomainCriteriaPanelProps) {
  return (
    <div className="space-y-4">
      {top}
      <DomainCriteriaPromptView prompt={prompt} />
      <DomainCriteriaItemsView items={items} />
    </div>
  );
}
