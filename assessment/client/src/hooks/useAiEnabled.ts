import { useEffect, useState } from 'react';
import { settingsApi } from '../lib/api';

export function useAiEnabled() {
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi.get()
      .then((res) => {
        if (!cancelled) setAiEnabled(res.data?.aiEnabled === true);
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return aiEnabled;
}
