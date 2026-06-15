let active = false;
let wakeLock: WakeLockSentinel | null = null;
let visibilityListenerAttached = false;

declare global {
  interface Window {
    assessmentDesktop?: {
      setDisplaySleepPrevention: (enabled: boolean) => Promise<boolean>;
    };
  }
}

async function requestWebWakeLock() {
  if (!active || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function attachVisibilityListener() {
  if (visibilityListenerAttached) return;
  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (active && document.visibilityState === 'visible' && !wakeLock) {
      void requestWebWakeLock();
    }
  });
}

export async function startDisplaySleepPrevention() {
  active = true;

  if (window.assessmentDesktop) {
    try {
      await window.assessmentDesktop.setDisplaySleepPrevention(true);
    } catch {
      // Screen sleep prevention is best-effort and must not block grading.
    }
    return;
  }

  attachVisibilityListener();
  await requestWebWakeLock();
}

export async function stopDisplaySleepPrevention() {
  active = false;

  if (window.assessmentDesktop) {
    try {
      await window.assessmentDesktop.setDisplaySleepPrevention(false);
    } catch {
      // Screen sleep prevention is best-effort and must not block grading.
    }
    return;
  }

  const currentWakeLock = wakeLock;
  wakeLock = null;
  try {
    await currentWakeLock?.release();
  } catch {
    // The browser may already have released the lock.
  }
}
