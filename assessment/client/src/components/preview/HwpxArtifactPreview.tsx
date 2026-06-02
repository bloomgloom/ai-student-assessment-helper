import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import initWasm, { HwpDocument } from '@rhwp/core';
import rhwpWasmUrl from '@rhwp/core/rhwp_bg.wasm?url';

let rhwpMeasureCtx: CanvasRenderingContext2D | null = null;
let rhwpLastFont = '';

function ensureRhwpMeasureTextWidth() {
  if ((globalThis as any).measureTextWidth) return;
  (globalThis as any).measureTextWidth = (font: string, text: string) => {
    if (!rhwpMeasureCtx) rhwpMeasureCtx = document.createElement('canvas').getContext('2d');
    if (!rhwpMeasureCtx) return text.length * 10;
    if (font !== rhwpLastFont) {
      rhwpMeasureCtx.font = font;
      rhwpLastFont = font;
    }
    return rhwpMeasureCtx.measureText(text).width;
  };
}

export default function HwpxArtifactPreview({ fileUrl }: { fileUrl: string }) {
  const [doc, setDoc] = useState<HwpDocument | null>(null);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let activeDoc: HwpDocument | null = null;
    (async () => {
      try {
        setError('');
        ensureRhwpMeasureTextWidth();
        await initWasm({ module_or_path: rhwpWasmUrl });
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`파일 로드 실패 (${res.status})`);
        const buf = await res.arrayBuffer();
        if (!active) return;
        activeDoc = new HwpDocument(new Uint8Array(buf));
        setDoc(activeDoc);
        setPages(activeDoc.pageCount());
      } catch (e) {
        console.error('HWPX 렌더링 오류:', e);
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; if (activeDoc) activeDoc.free(); };
  }, [fileUrl]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (!doc) return <div className="p-4 text-red-500 text-center">HWPX 렌더링 실패{error ? `: ${error}` : ''}</div>;
  if (pages <= 0) return <div className="p-4 text-red-500 text-center">HWPX 페이지를 찾을 수 없습니다.</div>;

  return (
    <div className="h-full overflow-auto flex flex-col items-center p-4 bg-gray-100 gap-4">
      {Array.from({ length: pages }).map((_, i) => (
        <canvas key={i} className="shadow bg-white"
          ref={c => { if (c && doc) doc.renderPageToCanvas(i, c, 1.5); }} />
      ))}
    </div>
  );
}
