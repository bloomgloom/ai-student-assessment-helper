import { useEffect, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { Loader2 } from 'lucide-react';

const mdRenderer = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });

export default function MarkdownArtifactPreview({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(fileUrl)
      .then(r => r.text())
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => setLoading(false));
  }, [fileUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div
        className="prose-preview max-w-none text-sm leading-relaxed text-gray-800"
        dangerouslySetInnerHTML={{ __html: mdRenderer.render(content) }}
      />
    </div>
  );
}
