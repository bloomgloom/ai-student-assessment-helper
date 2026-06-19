import { ChangeEvent, useRef } from 'react';
import { criteriaApi } from '../../lib/api';
import { saveBlob } from '../../lib/desktopFiles';
import { useDismissibleGuide } from '../../hooks/useDismissibleGuide';
import { CRITERIA_GUIDE_KEY } from './constants';
import { useCriteriaStandardsUpload } from './useCriteriaStandardsUpload';
import { useCriteriaTree } from './useCriteriaTree';

export function useCriteriaController() {
  const fileRef = useRef<HTMLInputElement>(null);
  const configFileRef = useRef<HTMLInputElement>(null);
  const guide = useDismissibleGuide(CRITERIA_GUIDE_KEY);
  const criteria = useCriteriaTree();
  const standardsUpload = useCriteriaStandardsUpload({
    inputRef: fileRef,
    reloadSubjects: async () => { await criteria.reloadSubjects(); },
    clearSelection: criteria.clearSelection,
  });

  const getDownloadFilename = (disposition: string, fallback: string) => {
    const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    return utf8Match ? decodeURIComponent(utf8Match[1]) : plainMatch ? plainMatch[1] : fallback;
  };

  const handleDownloadConfig = async () => {
    if (!criteria.selected) return;
    try {
      const r = await criteriaApi.exportStandardsConfig(
        criteria.selected.year,
        criteria.selected.semester,
        criteria.selected.grade,
        criteria.selected.subject,
        criteria.selected.domain_name
      );
      await saveBlob(
        getDownloadFilename(
        r.headers['content-disposition'] || '',
        `${criteria.selected.year}_${criteria.selected.subject}_${criteria.selected.domain_name}_성취기준.xlsx`
        ),
        r.data
      );
    } catch {
      alert('성취 기준 작업 내용 다운로드 실패');
    }
  };

  const handleUploadConfig = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!confirm('엑셀 파일의 기본정보에 있는 성취 기준 작업 내용을 업로드합니다. 계속하시겠습니까?')) {
      e.target.value = '';
      return;
    }
    try {
      const r = await criteriaApi.importStandardsConfig(e.target.files[0]);
      await criteria.selectImported(r.data);
      alert(`업로드 완료: 성취 기준 ${r.data.standards}개`);
    } catch (err: any) {
      alert(`성취 기준 작업 내용 업로드 실패: ${err?.response?.data?.error || err.message || String(err)}`);
    } finally {
      if (configFileRef.current) configFileRef.current.value = '';
    }
  };

  return {
    fileRef,
    configFileRef,
    guide,
    criteria,
    standardsUpload,
    handleDownloadConfig,
    handleUploadConfig,
  };
}
