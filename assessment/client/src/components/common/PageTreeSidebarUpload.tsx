import { ChangeEvent, isValidElement, ReactNode } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { acceptToFilters, filesToInputChangeEvent, hasDesktopFileDialogs, openFiles } from '../../lib/desktopFiles';

export interface PageTreeSidebarUploadConfig {
  label: ReactNode;
  loadingLabel?: ReactNode;
  loading?: boolean;
  input: ReactNode;
  hideLabel?: boolean;
}

interface PageTreeSidebarUploadProps {
  upload?: ReactNode | PageTreeSidebarUploadConfig;
}

function isUploadConfig(upload: ReactNode | PageTreeSidebarUploadConfig): upload is PageTreeSidebarUploadConfig {
  return !!upload && typeof upload === 'object' && 'input' in upload && 'label' in upload;
}

export function PageTreeSidebarUpload({ upload }: PageTreeSidebarUploadProps) {
  if (!upload) return null;
  if (!isUploadConfig(upload)) return <>{upload}</>;
  const inputProps = hasDesktopFileDialogs() && isValidElement(upload.input)
    ? upload.input.props as {
      accept?: string;
      multiple?: boolean;
      disabled?: boolean;
      onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    }
    : null;

  if (inputProps?.onChange) {
    return (
      <button
        type="button"
        className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md border ${upload.loading || inputProps.disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
        disabled={upload.loading || inputProps.disabled}
        onClick={async () => {
          const files = await openFiles({
            multiple: inputProps.multiple,
            filters: acceptToFilters(inputProps.accept),
          });
          if (files?.length) inputProps.onChange?.(filesToInputChangeEvent(files) as unknown as ChangeEvent<HTMLInputElement>);
        }}
      >
        {upload.loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {!upload.hideLabel && (upload.loading ? upload.loadingLabel || '처리 중...' : upload.label)}
      </button>
    );
  }

  return (
    <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${upload.loading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
      {upload.loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
      {!upload.hideLabel && (upload.loading ? upload.loadingLabel || '처리 중...' : upload.label)}
      {upload.input}
    </label>
  );
}
