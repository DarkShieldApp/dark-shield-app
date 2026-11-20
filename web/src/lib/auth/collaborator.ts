export function isActiveCollaborator(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'role_code' in value &&
    value.role_code === 'collaborator' &&
    'is_active' in value &&
    value.is_active === true
  );
}
