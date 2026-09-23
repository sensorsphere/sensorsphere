export function compareAgentVersions(left: string | null | undefined, right: string | null | undefined): number | null {
  const parse = (value: string | null | undefined) => {
    const match = value?.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-.].*)?$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as const : null;
  };
  const a = parse(left); const b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}

export function hasAgentUpdate(installed: string | null | undefined, latest: string | null | undefined): boolean {
  return compareAgentVersions(installed, latest) === -1;
}
