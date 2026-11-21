export function getSafeReturnPath(
  value: string | null,
  origin: string,
): string | null {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null;
  }

  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    return target.origin === base.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : null;
  } catch {
    return null;
  }
}
