import { useEffect, useRef, useState } from "react";

export function useResource<T>(
  key: string,
  loader: () => Promise<T>,
  {
    pollIntervalMs = 0,
    shouldPoll,
    retainPreviousData = false,
  }: {
    pollIntervalMs?: number;
    shouldPoll?: (data: T) => boolean;
    retainPreviousData?: boolean;
  } = {},
) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  const previous = useRef<{ key: string; data?: T }>({ key: "" });
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastData =
      retainPreviousData || previous.current.key === key
        ? previous.current.data
        : undefined;
    async function load() {
      try {
        const data = await loader();
        if (!active) return;
        lastData = data;
        previous.current = { key, data };
        setState({ key, data });
      } catch (error) {
        if (!active) return;
        setState({
          key,
          data: lastData,
          error:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        });
      }
      if (
        active &&
        pollIntervalMs &&
        lastData !== undefined &&
        shouldPoll?.(lastData)
      ) {
        timer = setTimeout(() => {
          void load();
        }, pollIntervalMs);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, loader, pollIntervalMs, shouldPoll, retainPreviousData]);
  return {
    data: state.key === key || retainPreviousData ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    loading: state.key !== key || (!state.data && !state.error),
  };
}
