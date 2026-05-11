import { useRef } from 'react';
import { useDismissibleGuide } from '../../hooks/useDismissibleGuide';
import { CRITERIA_GUIDE_KEY } from './constants';
import { useCriteriaStandardsUpload } from './useCriteriaStandardsUpload';
import { useCriteriaTree } from './useCriteriaTree';

export function useCriteriaController() {
  const fileRef = useRef<HTMLInputElement>(null);
  const guide = useDismissibleGuide(CRITERIA_GUIDE_KEY);
  const criteria = useCriteriaTree();
  const standardsUpload = useCriteriaStandardsUpload({
    inputRef: fileRef,
    reloadSubjects: criteria.reloadSubjects,
    clearSelection: criteria.clearSelection,
  });

  return {
    fileRef,
    guide,
    criteria,
    standardsUpload,
  };
}
