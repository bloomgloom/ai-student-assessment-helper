export function decodeUploadFilename(originalName: string): string {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const normalizedOriginal = originalName.normalize('NFC');
  const normalizedDecoded = decoded.normalize('NFC');

  if (normalizedDecoded.includes('\uFFFD')) return normalizedOriginal;
  if (/[가-힣]/.test(normalizedDecoded)) return normalizedDecoded;
  if (/[\u00c0-\u00ff]/.test(normalizedOriginal)) return normalizedDecoded;
  return normalizedOriginal;
}
