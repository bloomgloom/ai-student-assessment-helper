import { useEffect, useRef } from 'react';

interface UseStoredSelectionRestoreOptions<TItem, TStored> {
  storageKey: string;
  items: TItem[];
  findItem: (items: TItem[], stored: TStored) => TItem | undefined;
  onRestore: (item: TItem) => void;
}

export function saveStoredSelection<TStored>(storageKey: string, value: TStored) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function clearStoredSelection(storageKey: string) {
  localStorage.removeItem(storageKey);
}

export function useStoredSelectionRestore<TItem, TStored>({
  storageKey,
  items,
  findItem,
  onRestore,
}: UseStoredSelectionRestoreOptions<TItem, TStored>) {
  const restoredRef = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    if (restoredRef.current || items.length === 0) return;
    restoredRef.current = true;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const stored = JSON.parse(saved) as TStored;
      const item = findItem(items, stored);
      if (item) restoreRef.current(item);
    } catch {
      // Ignore invalid persisted selections.
    }
  }, [findItem, items, storageKey]);
}
