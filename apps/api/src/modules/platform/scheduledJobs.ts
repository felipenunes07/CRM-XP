export interface RecurringJobHandle {
  close(): Promise<void>;
}

interface RecurringJobOptions {
  intervalMs: number;
  run: () => Promise<unknown>;
  runImmediately?: boolean;
  onError?: (error: unknown) => void;
}

export function startRecurringJob({
  intervalMs,
  run,
  runImmediately = true,
  onError,
}: RecurringJobOptions): RecurringJobHandle {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("intervalMs must be a positive number");
  }

  let closed = false;
  let running = false;

  const trigger = () => {
    if (closed || running) {
      return;
    }

    running = true;
    void Promise.resolve()
      .then(run)
      .catch((error) => {
        onError?.(error);
      })
      .finally(() => {
        running = false;
      });
  };

  if (runImmediately) {
    trigger();
  }

  const interval = setInterval(trigger, intervalMs);

  return {
    async close() {
      closed = true;
      clearInterval(interval);
    },
  };
}
