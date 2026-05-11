import { useState } from 'react';

export function useDismissibleGuide(storageKey: string) {
  const [visible, setVisible] = useState(() => localStorage.getItem(storageKey) !== '1');

  const dismiss = () => {
    localStorage.setItem(storageKey, '1');
    setVisible(false);
  };

  return { visible, dismiss };
}
