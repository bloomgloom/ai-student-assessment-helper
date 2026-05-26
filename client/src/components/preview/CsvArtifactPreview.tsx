import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const encodings = ['utf-8', 'euc-kr', 'utf-16le'];
  for (const encoding of encodings) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(buffer);
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch { /* try next encoding */ }
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export default function CsvArtifactPreview({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setError('');
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`파일 로드 실패 (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (active) setContent(decodeCsvBuffer(buffer));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [fileUrl]);

  const rows = useMemo(() => parseCsv(content), [content]);
  const header = rows[0] || [];
  const body = rows.slice(1);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (error) return <div className="p-4 text-red-500 text-center">CSV 렌더링 실패: {error}</div>;
  if (rows.length === 0) return <div className="p-4 text-gray-500 text-center">CSV 내용이 없습니다.</div>;

  return (
    <div className="h-full overflow-auto bg-gray-50 p-4">
      <table className="min-w-full border-collapse bg-white text-xs shadow-sm">
        <thead className="sticky top-0 z-10 bg-gray-100">
          <tr>
            <th className="border border-gray-200 px-2 py-1 text-right font-semibold text-gray-500 w-12">#</th>
            {header.map((cell, idx) => (
              <th key={idx} className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-700 whitespace-pre-wrap">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIdx) => (
            <tr key={rowIdx} className="odd:bg-white even:bg-gray-50">
              <td className="border border-gray-200 px-2 py-1 text-right text-gray-400">{rowIdx + 1}</td>
              {Array.from({ length: Math.max(header.length, row.length) }).map((_, cellIdx) => (
                <td key={cellIdx} className="border border-gray-200 px-2 py-1 text-gray-800 whitespace-pre-wrap align-top">
                  {row[cellIdx] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
