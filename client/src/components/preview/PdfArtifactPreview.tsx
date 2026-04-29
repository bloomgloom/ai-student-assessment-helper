import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { artifactsApi } from '../../lib/api';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfArtifactPreview({
  artifactId,
  pdfPages,
  setPdfPages,
}: {
  artifactId: number;
  pdfPages: number;
  setPdfPages: (n: number) => void;
}) {
  return (
    <div className="h-full overflow-auto flex justify-center p-4 bg-gray-100">
      <Document file={artifactsApi.fileUrl(artifactId)} onLoadSuccess={({ numPages }) => setPdfPages(numPages)}>
        {Array.from({ length: pdfPages }, (_, i) => (
          <Page key={i} pageNumber={i + 1} className="mb-2 shadow" width={Math.min(window.innerWidth * 0.75, 800)} />
        ))}
      </Document>
    </div>
  );
}
