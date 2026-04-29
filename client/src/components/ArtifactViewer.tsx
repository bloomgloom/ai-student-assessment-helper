import { lazy, Suspense, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { artifactsApi } from '../lib/api';
import { Upload, X, Loader2, Eye, File, Download } from 'lucide-react';

const ArtifactPreviewContent = lazy(() => import('./ArtifactPreviewContent'));

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

function isCodeFile(f: string) { return ['js','jsx','ts','tsx','py','c','cpp','h','java','css','sql','json','md','txt'].includes(getExt(f)); }

function sortArtifacts(a: Artifact, b: Artifact) {
  const extCompare = getExt(a.filename).localeCompare(getExt(b.filename), 'ko');
  if (extCompare !== 0) return extCompare;
  return a.filename.localeCompare(b.filename, 'ko', { numeric: true });
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
    setArtifacts([...r.data].sort(sortArtifacts));
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
                <a href={artifactsApi.viewerUrl(viewing.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1">
                  <Eye size={13} /> 새 탭
                </a>
                <a href={artifactsApi.fileUrl(viewing.id)} download={viewing.filename} className="btn-secondary text-xs py-1">
                  <Download size={13} /> 다운로드
                </a>
                <button className="btn-secondary text-xs py-1" onClick={() => setViewing(null)}>
                  <X size={13} /> 닫기
                </button>
              </div>
            </div>

            <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}>
              <ArtifactPreviewContent
                artifact={viewing}
                codeContent={codeContent}
                loadingCode={loadingCode}
                pdfPages={pdfPages}
                setPdfPages={setPdfPages}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtifactStandalonePage() {
  const { id } = useParams();
  const artifactId = Number(id);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [codeContent, setCodeContent] = useState('');
  const [pdfPages, setPdfPages] = useState(0);
  const [loadingCode, setLoadingCode] = useState(false);

  useEffect(() => {
    if (!artifactId) return;
    (async () => {
      const r = await artifactsApi.getOne(artifactId);
      setArtifact(r.data);
      if (isCodeFile(r.data.filename)) {
        setLoadingCode(true);
        try {
          setCodeContent(await (await fetch(artifactsApi.fileUrl(artifactId))).text());
        } finally {
          setLoadingCode(false);
        }
      }
    })();
  }, [artifactId]);

  if (!artifact) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <span className="font-medium text-sm text-gray-800 truncate">{artifact.filename}</span>
        <a href={artifactsApi.fileUrl(artifact.id)} download={artifact.filename} className="btn-secondary text-xs py-1">
          <Download size={13} /> 다운로드
        </a>
      </div>
      <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}>
        <ArtifactPreviewContent
          artifact={artifact}
          codeContent={codeContent}
          loadingCode={loadingCode}
          pdfPages={pdfPages}
          setPdfPages={setPdfPages}
        />
      </Suspense>
    </div>
  );
}
