export function hasDesktopFileDialogs() {
  return Boolean(window.assessmentDesktop?.saveFile && window.assessmentDesktop?.openFiles);
}

export async function saveBlob(filename: string, blob: Blob) {
  if (window.assessmentDesktop?.saveFile) {
    await window.assessmentDesktop.saveFile(filename, await blob.arrayBuffer());
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function openFiles(options?: DesktopOpenFilesOptions): Promise<File[] | null> {
  if (!window.assessmentDesktop?.openFiles) return null;
  const result = await window.assessmentDesktop.openFiles(options);
  if (result.canceled) return [];
  return result.files.map(file => new File([file.data], file.name));
}

export function filesToInputChangeEvent(files: File[]) {
  return {
    target: { files, value: '' },
    currentTarget: { files, value: '' },
  };
}

export function acceptToFilters(accept?: string) {
  if (!accept) return undefined;
  const extensions = accept
    .split(',')
    .map(value => value.trim())
    .filter(value => value.startsWith('.'))
    .map(value => value.slice(1))
    .filter(Boolean);
  return extensions.length ? [{ name: 'Files', extensions }] : undefined;
}
