import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { Extension } from '@codemirror/state';
import { Loader2 } from 'lucide-react';

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

async function loadLanguageExtension(filename: string): Promise<Extension | null> {
  switch (getExt(filename)) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true, typescript: true });
    }
    case 'py': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'c':
    case 'cpp':
    case 'h': {
      const { cpp } = await import('@codemirror/lang-cpp');
      return cpp();
    }
    case 'java': {
      const { java } = await import('@codemirror/lang-java');
      return java();
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql');
      return sql();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
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
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLanguageExtension(null);

    loadLanguageExtension(filename).then(extension => {
      if (!cancelled) setLanguageExtension(extension);
    });

    return () => {
      cancelled = true;
    };
  }, [filename]);

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
        extensions={languageExtension ? [languageExtension] : []}
        readOnly
        style={{ height: '100%', fontSize: 13 }}
        basicSetup={{ lineNumbers: true, foldGutter: true, tabSize: 4 }}
      />
    </div>
  );
}
