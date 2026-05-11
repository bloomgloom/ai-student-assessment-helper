import { RefObject, useState } from 'react';
import { criteriaApi } from '../../lib/api';
import { useOverwriteUpload } from '../../hooks/useOverwriteUpload';

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
    getConflictMessage: (data) =>
      `${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}의 데이터가 이미 있습니다. 덮어씌우시겠습니까?\n(기존의 성취기준 및 영역 데이터가 모두 삭제됩니다)`,
    onBeforeUpload: () => {
      setMessage(null);
      setError(null);
    },
    onSuccess: async (res) => {
      const data = res.data;
      setMessage(`${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 성취 기준 ${data.standardsCount}개 업로드`);
      await reloadSubjects();
      clearSelection();
    },
    onError: setError,
  });

  return { uploading, handleUpload, message, error };
}
