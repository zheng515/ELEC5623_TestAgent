import { useEffect, useState } from "react";

export function useResource<T>(key: string, loader: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    let active = true;
    loader().then(
      (data) => {
        if (active) setState({ key, data });
      },
      (error: unknown) => {
        if (active)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [key, loader]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    loading: state.key !== key || (!state.data && !state.error),
  };
}
