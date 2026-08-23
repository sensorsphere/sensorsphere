export function activeFilterStyles(active: boolean) {
  return active
    ? {
        input: {
          border: "2px solid var(--mantine-color-blue-6)"
        }
      }
    : undefined;
}

export function activeFilterControlStyle(active: boolean) {
  return active
    ? {
        border: "2px solid var(--mantine-color-blue-6)",
        borderRadius: "var(--mantine-radius-sm)"
      }
    : undefined;
}
