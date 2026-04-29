import { lazy, Suspense } from 'react';
import { File, Loader2 } from 'lucide-react';
import { artifactsApi } from '../lib/api';

const CodeArtifactPreview = lazy(() => import('./preview/CodeArtifactPreview'));
const PdfArtifactPreview = lazy(() => import('./preview/PdfArtifactPreview'));
const HwpxArtifactPreview = lazy(() => import('./preview/HwpxArtifactPreview'));

interface Artifact {
  id: number;
  filename: string;
}

interface ArtifactPreviewContentProps {
  artifact: Artifact;
  codeContent: string;
  loadingCode: boolean;
  pdfPages: number;
  setPdfPages: (n: number) => void;
}

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function isCodeFile(f: string) { return ['js','jsx','ts','tsx','py','c','cpp','h','java','css','sql','json','md','txt'].includes(getExt(f)); }
function isHtmlFile(f: string) { return getExt(f) === 'html'; }
function isPdfFile(f: string) { return getExt(f) === 'pdf'; }
function isHwpxFile(f: string) { return getExt(f) === 'hwpx'; }

function PreviewFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );
}

export default function ArtifactPreviewContent({
  artifact,
  codeContent,
  loadingCode,
  pdfPages,
  setPdfPages,
}: ArtifactPreviewContentProps) {
  return (
    <div className="flex-1 overflow-hidden" style={{ textAlign: 'left' }}>
      {isPdfFile(artifact.filename) ? (
        <Suspense fallback={<PreviewFallback />}>
          <PdfArtifactPreview
            artifactId={artifact.id}
            pdfPages={pdfPages}
            setPdfPages={setPdfPages}
          />
        </Suspense>
      ) : isHwpxFile(artifact.filename) ? (
        <Suspense fallback={<PreviewFallback />}>
          <HwpxArtifactPreview fileUrl={artifactsApi.fileUrl(artifact.id)} />
        </Suspense>
      ) : isHtmlFile(artifact.filename) ? (
        <iframe
          src={artifactsApi.fileUrl(artifact.id)}
          className="w-full h-full border-none bg-white"
          title="HTML Viewer"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : isCodeFile(artifact.filename) ? (
        <Suspense fallback={<PreviewFallback />}>
          <CodeArtifactPreview
            filename={artifact.filename}
            codeContent={codeContent}
            loadingCode={loadingCode}
          />
        </Suspense>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
          <File size={48} className="text-gray-300" />
          <p>이 파일 형식은 뷰어에서 지원하지 않습니다.</p>
          <a href={artifactsApi.fileUrl(artifact.id)} className="btn-primary" download={artifact.filename}>다운로드</a>
        </div>
      )}
    </div>
  );
}
