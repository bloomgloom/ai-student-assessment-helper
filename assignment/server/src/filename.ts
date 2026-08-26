export function decodeUploadFilename(originalName: string): string {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const normalizedOriginal = originalName.normalize('NFC');
  const normalizedDecoded = decoded.normalize('NFC');

  if (normalizedDecoded.includes('\uFFFD')) return normalizedOriginal;
  if (/[가-힣]/.test(normalizedDecoded)) return normalizedDecoded;
  if (/[\u00c0-\u00ff]/.test(normalizedOriginal)) return normalizedDecoded;
  return normalizedOriginal;
}

export function studentDownloadFilename(grade: number, classNum: number, seatNum: number, name: string, filename: string): string {
  const studentNumber = grade * 10000 + classNum * 100 + seatNum;
  const safeName = name.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1F\s]/g, '');
  const safeFilename = filename.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'file';
  return `${studentNumber}${safeName}_${safeFilename}`;
}
