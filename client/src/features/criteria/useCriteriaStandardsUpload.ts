import { RefObject, useState } from 'react';
import { criteriaApi } from '../../lib/api';
import { useOverwriteUpload } from '../../hooks/useOverwriteUpload';
import { CRITERIA_UPLOAD_TEXT } from './constants';

interface UseCriteriaStandardsUploadOptions {
  inputRef: RefObject<HTMLInputElement>;
  reloadSubjects: () => Promise<void>;
  clearSelection: () => void;
}

export function useCriteriaStandardsUpload({
  inputRef,
  reloadSubjects,
  clearSelection,
}: UseCriteriaStandardsUploadOptions) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { uploading, handleUpload } = useOverwriteUpload({
    inputRef,
    upload: (file, overwrite) => criteriaApi.uploadStandards(file, overwrite),
    getConflictMessage: CRITERIA_UPLOAD_TEXT.conflictConfirm,
    onBeforeUpload: () => {
      setMessage(null);
      setError(null);
    },
    onSuccess: async (res) => {
      const data = res.data;
      setMessage(CRITERIA_UPLOAD_TEXT.successMessage(data));
      await reloadSubjects();
      clearSelection();
    },
    onError: setError,
  });

  return { uploading, handleUpload, message, error };
}
