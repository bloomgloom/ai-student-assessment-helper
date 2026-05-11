import { ChangeEvent, RefObject, useState } from 'react';
import { criteriaApi } from '../../lib/api';
import { DOMAIN_UPLOAD_TEXT } from './constants';

interface UseDomainDomainsUploadOptions {
  inputRef: RefObject<HTMLInputElement>;
  reloadSubjects: () => Promise<void>;
}

export function useDomainDomainsUpload({
  inputRef,
  reloadSubjects,
}: UseDomainDomainsUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await criteriaApi.uploadDomains(file);
      const data = res.data;
      setMessage(DOMAIN_UPLOAD_TEXT.successMessage(data));
      await reloadSubjects();
    } catch (err: any) {
      setError(err?.response?.data?.error || String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return { uploading, message, error, handleUpload };
}
