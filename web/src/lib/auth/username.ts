export function normalizeUsername(value: string): string | null {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{3,30}$/.test(username) ? username : null;
}

export function isEmailIdentifier(value: string): boolean {
  return value.includes('@') && !value.startsWith('@');
}
