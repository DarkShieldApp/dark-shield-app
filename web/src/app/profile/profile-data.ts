import type { EffectivePermissions } from '../../server/authorization';
import type { Profile } from '../../server/profiles';

// HU-10/T3: Load authenticated profile and effective permissions.

export type ProfileData = {
  profile: Profile;
  authorization: EffectivePermissions;
};

export async function loadProfileData(
  accessToken: string,
): Promise<ProfileData> {
  if (!accessToken.trim()) {
    throw new Error('An authenticated session is required.');
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const [profileResponse, permissionsResponse] = await Promise.all([
    fetch('/api/me/profile', {
      headers,
      cache: 'no-store',
    }),
    fetch('/api/me/permissions', {
      headers,
      cache: 'no-store',
    }),
  ]);

  if (!profileResponse.ok || !permissionsResponse.ok) {
    throw new Error('Unable to load profile information.');
  }

  const profile = (await profileResponse.json()) as Profile;
  const authorization =
    (await permissionsResponse.json()) as EffectivePermissions;

  return {
    profile,
    authorization,
  };
}
