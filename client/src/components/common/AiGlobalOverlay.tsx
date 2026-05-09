import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAiBatchStore } from '../../stores/aiBatchStore';
import { useAiOverlayStore } from '../../stores/aiOverlayStore';
import { AiProgressOverlay } from './AiProgressOverlay';

export function AiGlobalOverlay() {
  const overlay = useAiOverlayStore();
  const batchJob = useAiBatchStore(state => state.currentJob);
  const stopBatch = useAiBatchStore(state => state.stopBatch);

  const batchRunning = batchJob?.status === 'running' || batchJob?.status === 'stopping';
  const batchFinished = batchJob && !batchRunning;

  if (overlay.active) {
    return (
      <AiProgressOverlay
        title={overlay.title}
        message={overlay.message}
        progress={overlay.progress}
        indeterminate={overlay.progress < 0}
        stopping={overlay.stopping}
        onStop={overlay.stop}
        tone="blue"
      />
    );
  }

  if (!batchRunning && !batchFinished) return null;

  const job = batchJob!;
  const failed = job.status === 'error';
  const completed = job.status === 'completed';
  const percent = (job.completed / Math.max(job.total, 1)) * 100;

  return (
    <AiProgressOverlay
      title={job.classLabel}
      message={job.message}
      detail={`${job.completed}/${job.total}`}
      progress={percent}
      running={batchRunning}
      stopping={job.status === 'stopping'}
      onStop={stopBatch}
      tone={failed ? 'red' : completed ? 'green' : 'blue'}
      backdrop={batchRunning ? 'strong' : 'soft'}
      icon={batchRunning
        ? <Loader2 size={18} className="animate-spin text-blue-600" />
        : failed
          ? <AlertCircle size={18} className="text-red-500" />
          : <CheckCircle2 size={18} className="text-green-500" />
      }
    />
  );
}
