import React from "react";

const STORAGE_PREFIX =
  "sensorsphere.ui.v1.";

function readStoredValue<T>(
  key: string,
  fallback: T,
  validate?:
    (value: unknown) => value is T
): T {

  if (
    typeof window ===
      "undefined"
  ) {
    return fallback;
  }

  try {

    const raw =
      window.localStorage.getItem(
        STORAGE_PREFIX + key
      );

    if (raw === null) {
      return fallback;
    }

    const parsed:
      unknown =
      JSON.parse(raw);

    if (
      validate &&
      !validate(parsed)
    ) {
      return fallback;
    }

    return parsed as T;

  } catch {

    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate?:
    (value: unknown) => value is T
): [
  T,
  React.Dispatch<
    React.SetStateAction<T>
  >
] {

  const [
    value,
    setValue
  ] =
    React.useState<T>(
      () =>
        readStoredValue(
          key,
          fallback,
          validate
        )
    );

  React.useEffect(
    () => {

      try {

        window.localStorage.setItem(
          STORAGE_PREFIX + key,
          JSON.stringify(
            value
          )
        );

      } catch {
        // Ignore unavailable or full localStorage.
      }

    },
    [
      key,
      value
    ]
  );

  return [
    value,
    setValue
  ];
}
