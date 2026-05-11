import { ChangeEvent, RefObject, useState } from 'react';
import { criteriaApi } from '../../lib/api';

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
      setMessage(`${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 영역 ${data.totalCount}개 업로드, 수행 반영 영역 ${data.reflectedPerformanceCount}개`);
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
