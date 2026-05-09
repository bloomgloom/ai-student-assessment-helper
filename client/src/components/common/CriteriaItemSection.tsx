import { ReactNode } from 'react';
import { CriteriaItemToolbar } from './CriteriaItemToolbar';

interface CriteriaItemSectionProps {
  title: string;
  addLabel: string;
  empty?: ReactNode;
  children: ReactNode;
  generating?: boolean;
  generateDisabled?: boolean;
  onGenerate?: () => void;
  onAdd: () => void;
}

export function CriteriaItemSection({
  title,
  addLabel,
  empty,
  children,
  generating,
  generateDisabled,
  onGenerate,
  onAdd,
}: CriteriaItemSectionProps) {
  return (
    <div className="space-y-2">
      <CriteriaItemToolbar
        title={title}
        addLabel={addLabel}
        generating={generating}
        generateDisabled={generateDisabled}
        onGenerate={onGenerate || (() => undefined)}
        onAdd={onAdd}
        showGenerate={!!onGenerate}
      />
      <div className="space-y-2">
        {empty}
        {children}
      </div>
    </div>
  );
}
