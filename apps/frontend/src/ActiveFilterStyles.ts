export function activeFilterStyles(active: boolean) {
  return active
    ? { input: { borderWidth: 2, borderColor: "var(--mantine-primary-color-filled)" } }
    : undefined;
}
