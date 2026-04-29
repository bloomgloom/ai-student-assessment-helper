import { useState, useEffect } from 'react';
import { artifactsApi } from '../lib/api';
import { Upload, X, Loader2, Eye, File } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import initWasm, { HwpDocument } from '@rhwp/core';
import rhwpWasmUrl from '@rhwp/core/rhwp_bg.wasm?url';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

interface Artifact {
  id: number;
  filename: string;
  mime_type: string;
  domain: string;
  uploaded_at: string;
}

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getExtLabel(filename: string): string {
  return (filename.split('.').pop() || 'FILE').toUpperCase();
}

function extBadgeClass(filename: string): string {
  switch (getExt(filename)) {
    case 'py':   return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'c':
    case 'cpp':
    case 'h':    return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'pdf':  return 'bg-red-100 text-red-700 border-red-300';
    case 'html': return 'bg-orange-100 text-orange-700 border-orange-300';
    case 'hwpx': return 'bg-teal-100 text-teal-700 border-teal-300';
    case 'java': return 'bg-red-100 text-red-800 border-red-300';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'json': return 'bg-gray-100 text-gray-700 border-gray-300';
    case 'sql':  return 'bg-green-100 text-green-700 border-green-300';
    default:     return 'bg-gray-100 text-gray-500 border-gray-300';
  }
}

function getLanguageExtension(filename: string) {
  switch (getExt(filename)) {
    case 'js': case 'jsx': case 'ts': case 'tsx': return javascript({ jsx: true, typescript: true });
    case 'py':   return python();
    case 'c': case 'cpp': case 'h': return cpp();
    case 'java': return java();
    case 'html': return html();
    case 'css':  return css();
    case 'sql':  return sql();
    case 'json': return json();
    default: return null;
  }
}

function isCodeFile(f: string) { return ['js','jsx','ts','tsx','py','c','cpp','h','java','css','sql','json','md','txt'].includes(getExt(f)); }
function isHtmlFile(f: string)  { return getExt(f) === 'html'; }
function isPdfFile(f: string)   { return getExt(f) === 'pdf'; }
function isHwpxFile(f: string)  { return getExt(f) === 'hwpx'; }

// ── HWPX 렌더러 (rhwp) ────────────────────────────────────────────────────────
function HwpxRenderer({ fileUrl }: { fileUrl: string }) {
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

interface ArtifactViewerProps {
  studentId: number;
  domain: string;
}

export default function ArtifactViewer({ studentId, domain }: ArtifactViewerProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [viewing, setViewing] = useState<Artifact | null>(null);
  const [codeContent, setCodeContent] = useState('');
  const [pdfPages, setPdfPages] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);

  const loadArtifacts = async () => {
    const r = await artifactsApi.getByDomain(studentId, domain);
    setArtifacts(r.data);
  };

  useEffect(() => { loadArtifacts(); }, [studentId, domain]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    try {
      await artifactsApi.upload(studentId, domain, e.target.files);
      await loadArtifacts();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('파일을 삭제하시겠습니까?')) return;
    await artifactsApi.delete(id);
    if (viewing?.id === id) setViewing(null);
    await loadArtifacts();
  };

  const handleView = async (artifact: Artifact) => {
    setViewing(artifact);
    setCodeContent('');
    if (isCodeFile(artifact.filename)) {
      setLoadingCode(true);
      try {
        setCodeContent(await (await fetch(artifactsApi.fileUrl(artifact.id))).text());
      } finally {
        setLoadingCode(false);
      }
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center justify-center">
      {/* 파일 배지 */}
      {artifacts.map((a) => (
        <div key={a.id} className="relative group">
          <button
            className={`px-2 py-0.5 text-[11px] font-bold rounded border cursor-pointer whitespace-nowrap ${extBadgeClass(a.filename)}`}
            onClick={() => handleView(a)}
            title={a.filename}
          >
            {getExtLabel(a.filename)}
          </button>
          <button
            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white"
            onClick={() => handleDelete(a.id)}
          >
            <X size={8} />
          </button>
        </div>
      ))}

      {/* 업로드 버튼 (아이콘만) */}
      <label className={`flex items-center justify-center w-6 h-6 rounded cursor-pointer border border-dashed ${
        uploading ? 'border-gray-300 text-gray-300' : 'border-blue-300 text-blue-500 hover:bg-blue-50'
      }`}>
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        <input type="file" className="hidden" multiple onChange={handleUpload} disabled={uploading} />
      </label>

      {/* 뷰어 모달 */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-[85vw] h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <span className="font-medium text-sm text-gray-800 truncate max-w-[60%]">{viewing.filename}</span>
              <div className="flex gap-2 shrink-0">
                <a href={artifactsApi.fileUrl(viewing.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1">
                  <Eye size={13} /> 새 탭
                </a>
                <button className="btn-secondary text-xs py-1" onClick={() => setViewing(null)}>
                  <X size={13} /> 닫기
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden" style={{ textAlign: 'left' }}>
              {isPdfFile(viewing.filename) ? (
                <div className="h-full overflow-auto flex justify-center p-4 bg-gray-100">
                  <Document file={artifactsApi.fileUrl(viewing.id)} onLoadSuccess={({ numPages }) => setPdfPages(numPages)}>
                    {Array.from({ length: pdfPages }, (_, i) => (
                      <Page key={i} pageNumber={i + 1} className="mb-2 shadow" width={Math.min(window.innerWidth * 0.75, 800)} />
                    ))}
                  </Document>
                </div>
              ) : isHwpxFile(viewing.filename) ? (
                <HwpxRenderer fileUrl={artifactsApi.fileUrl(viewing.id)} />
              ) : isHtmlFile(viewing.filename) ? (
                <iframe
                  src={artifactsApi.fileUrl(viewing.id)}
                  className="w-full h-full border-none bg-white"
                  title="HTML Viewer"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : loadingCode ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : isCodeFile(viewing.filename) ? (
                <div className="h-full overflow-auto" style={{ textAlign: 'left' }}>
                  <CodeMirror
                    value={codeContent}
                    theme={oneDark}
                    extensions={[getLanguageExtension(viewing.filename)].filter(Boolean) as never[]}
                    readOnly
                    style={{ height: '100%', fontSize: 13 }}
                    basicSetup={{ lineNumbers: true, foldGutter: true, tabSize: 4 }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                  <File size={48} className="text-gray-300" />
                  <p>이 파일 형식은 뷰어에서 지원하지 않습니다.</p>
                  <a href={artifactsApi.fileUrl(viewing.id)} className="btn-primary" download>다운로드</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
