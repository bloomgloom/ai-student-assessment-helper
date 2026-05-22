import { RefObject, useState } from 'react';
import { criteriaApi } from '../../lib/api';
import { useOverwriteUpload } from '../../hooks/useOverwriteUpload';
import { DOMAIN_UPLOAD_TEXT } from './constants';

interface UseDomainDomainsUploadOptions {
  inputRef: RefObject<HTMLInputElement>;
  reloadSubjects: () => Promise<void>;
}

export function useDomainDomainsUpload({
  inputRef,
  reloadSubjects,
}: UseDomainDomainsUploadOptions) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { uploading, handleUpload } = useOverwriteUpload({
    inputRef,
    upload: (file, overwrite) => criteriaApi.uploadDomains(file, overwrite),
    getConflictMessage: DOMAIN_UPLOAD_TEXT.conflictConfirm,
    onBeforeUpload: () => {
      setMessage(null);
      setError(null);
    },
    onSuccess: async (res) => {
      const data = res.data;
      setMessage(DOMAIN_UPLOAD_TEXT.successMessage(data));
      await reloadSubjects();
    },
    onError: setError,
  });

  return { uploading, message, error, handleUpload };
}
