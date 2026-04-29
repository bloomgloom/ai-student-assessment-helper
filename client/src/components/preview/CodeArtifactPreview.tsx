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
import { Loader2 } from 'lucide-react';

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getLanguageExtension(filename: string) {
  switch (getExt(filename)) {
    case 'js': case 'jsx': case 'ts': case 'tsx': return javascript({ jsx: true, typescript: true });
    case 'py': return python();
    case 'c': case 'cpp': case 'h': return cpp();
    case 'java': return java();
    case 'html': return html();
    case 'css': return css();
    case 'sql': return sql();
    case 'json': return json();
    default: return null;
  }
}

export default function CodeArtifactPreview({
  filename,
  codeContent,
  loadingCode,
}: {
  filename: string;
  codeContent: string;
  loadingCode: boolean;
}) {
  if (loadingCode) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" style={{ textAlign: 'left' }}>
      <CodeMirror
        value={codeContent}
        theme={oneDark}
        extensions={[getLanguageExtension(filename)].filter(Boolean) as never[]}
        readOnly
        style={{ height: '100%', fontSize: 13 }}
        basicSetup={{ lineNumbers: true, foldGutter: true, tabSize: 4 }}
      />
    </div>
  );
}
