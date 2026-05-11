import { ChangeEvent, RefObject, useRef, useState } from 'react';

interface UseOverwriteUploadOptions<TResult> {
  inputRef: RefObject<HTMLInputElement>;
  upload: (file: File, overwrite?: boolean) => Promise<TResult>;
  getConflictMessage: (errorData: any) => string;
  onSuccess: (result: TResult) => Promise<void> | void;
  onError: (message: string) => void;
  onBeforeUpload?: () => void;
}

export function useOverwriteUpload<TResult>({
  inputRef,
  upload,
  getConflictMessage,
  onSuccess,
  onError,
  onBeforeUpload,
}: UseOverwriteUploadOptions<TResult>) {
  const [uploading, setUploading] = useState(false);
  const pendingFileRef = useRef<File | null>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement> | null, overwrite?: boolean) => {
    const file = event?.target.files?.[0] ?? pendingFileRef.current;
    if (!file) return;
    if (event) pendingFileRef.current = file;
    setUploading(true);
    onBeforeUpload?.();
    try {
      const result = await upload(file, overwrite);
      pendingFileRef.current = null;
      await onSuccess(result);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const message = getConflictMessage(err.response.data);
        if (window.confirm(message)) {
          await handleUpload(null, true);
        } else {
          resetInput();
          pendingFileRef.current = null;
        }
        return;
      }
      onError(err?.response?.data?.error || String(err));
    } finally {
      setUploading(false);
      if (event) resetInput();
    }
  };

  return { uploading, handleUpload };
}
