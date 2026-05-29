import { RefObject, useRef, useState } from 'react';
import { classesApi } from '../../lib/api';
import { ClassItem, RecordsUploadMessage, Student } from './types';

interface UseRecordsUploadOptions {
  selectedClass: ClassItem | null;
  setClasses: (classes: ClassItem[]) => void;
  setSelectedClass: (classItem: ClassItem | null) => void;
  setStudents: (students: Student[]) => void;
  setContents: (contents: Record<string, any>) => void;
  setSavedContents: (contents: Record<string, any>) => void;
  onSelectClass: (classItem: ClassItem) => Promise<void>;
}

export function useRecordsUpload({
  selectedClass,
  setClasses,
  setSelectedClass,
  setStudents,
  setContents,
  setSavedContents,
  onSelectClass,
}: UseRecordsUploadOptions) {
  const classFilesRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<RecordsUploadMessage | null>(null);

  const handleClassFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadingFiles(true);
    setUploadMsg({ type: 'success', text: `파일 ${files.length}개 업로드 중...` });

    const messages: string[] = [];
    let hasError = false;
    let hasWarn = false;

    try {
      for (const file of files) {
        const normalizedName = file.name.normalize('NFC');
        const isComments = normalizedName.includes('과목세특');
        try {
          const res = isComments
            ? await classesApi.uploadComments(file)
            : await classesApi.uploadScoring(file);
          const d = res.data;
          const warnings: string[] = [];
          if (d.domainMismatch) warnings.push(`영역 불일치: ${d.domainMismatch}`);
          if (d.studentMismatch?.length) warnings.push(`학생 명단 불일치: ${d.studentMismatch.join(', ')}`);
          if (warnings.length) hasWarn = true;
          messages.push(
            `[완료] ${isComments ? '세특' : '채점'} - ${normalizedName}` +
            (warnings.length ? `\n  ${warnings.join('\n  ')}` : '')
          );
        } catch (err: any) {
          hasError = true;
          messages.push(`[실패] ${normalizedName}\n  ${err?.response?.data?.error || String(err)}`);
        }
      }

      const refreshed = (await classesApi.getAll()).data as ClassItem[];
      setClasses(refreshed);
      if (selectedClass) {
        const refreshedSelected = refreshed.find(c => c.id === selectedClass.id);
        if (refreshedSelected) await onSelectClass(refreshedSelected);
        else {
          setSelectedClass(null);
          setStudents([]);
          setContents({});
          setSavedContents({});
        }
      }

      setUploadMsg({
        type: hasError ? 'error' : hasWarn ? 'warn' : 'success',
        text: messages.join('\n'),
      });
    } finally {
      setUploadingFiles(false);
      if (classFilesRef.current) classFilesRef.current.value = '';
    }
  };

  return {
    classFilesRef: classFilesRef as RefObject<HTMLInputElement>,
    uploadingFiles,
    uploadMsg,
    handleClassFilesUpload,
  };
}
