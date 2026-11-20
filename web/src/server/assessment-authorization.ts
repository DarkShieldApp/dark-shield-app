import 'server-only';

import type { EffectivePermissions } from './authorization';
import { getMyProfile } from './profile-query';
import {
  createAuthenticatedSupabaseClient,
  extractBearerToken,
  verifyBearer,
} from './session';

export type AssessmentAuthorization =
  | {
      allowed: true;
      assessorId: string;
      trustLevel: number;
      minimumTrustLevel: number;
    }
  | {
      allowed: false;
      reason:
        | 'UNAUTHENTICATED'
        | 'INVALID_SESSION'
        | 'POLICY_UNAVAILABLE'
        | 'PROFILE_UNAVAILABLE'
        | 'PERMISSION_DENIED'
        | 'INVALID_TRUST_LEVEL'
        | 'INSUFFICIENT_TRUST'
        | 'SERVICE_UNAVAILABLE';
    };

/**
 * HU-08/T2: actor eligibility for either assessment action, checked afresh.
 * T4 must also enforce report/participation rules at the write boundary.
 * Accepts only the Authorization header, never client-supplied identity or trust.
 */
export async function checkAssessmentAuthorization(
  authorizationHeader: string | null,
): Promise<AssessmentAuthorization> {
  try {
    const token = extractBearerToken(authorizationHeader);
    if (!token) return { allowed: false, reason: 'UNAUTHENTICATED' };

    // No approved default. Canonical decimal integers only, read on each call.
    const rawMinimum = process.env.ASSESSMENTS_MIN_TRUST_LEVEL;
    if (
      !rawMinimum ||
      rawMinimum.trim() !== rawMinimum ||
      !/^(?:[1-9]\d?|100)$/.test(rawMinimum)
    ) {
      return { allowed: false, reason: 'POLICY_UNAVAILABLE' };
    }
    const minimumTrustLevel = Number(rawMinimum);

    const client = createAuthenticatedSupabaseClient(token);
    const { userId, error } = await verifyBearer(client, token);
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      return { allowed: false, reason: 'SERVICE_UNAVAILABLE' };
    }
    if (error || !userId) return { allowed: false, reason: 'INVALID_SESSION' };

    const profile = await getMyProfile(client, userId);
    if (!profile || profile.id !== userId || profile.is_active !== true) {
      return { allowed: false, reason: 'PROFILE_UNAVAILABLE' };
    }

    // HU-14/T3's RPC derives the subject from auth.uid() and reads the live matrix.
    // Do not use the admin-only HTTP wrapper or infer capabilities from role_code.
    const { data, error: permissionError } = await client.rpc('my_permissions');
    if (permissionError) {
      return { allowed: false, reason: 'SERVICE_UNAVAILABLE' };
    }
    const effective = data as Partial<EffectivePermissions> | null;
    if (
      !Array.isArray(effective?.permissions) ||
      effective.roleCode !== 'collaborator' ||
      !effective.permissions.every(
        (permission) => typeof permission === 'string',
      ) ||
      !effective.permissions.includes('assessments.submit')
    ) {
      return { allowed: false, reason: 'PERMISSION_DENIED' };
    }

    const trustLevel = profile.trust_level;
    if (!Number.isInteger(trustLevel) || trustLevel < 1 || trustLevel > 100) {
      return { allowed: false, reason: 'INVALID_TRUST_LEVEL' };
    }
    if (trustLevel < minimumTrustLevel) {
      return { allowed: false, reason: 'INSUFFICIENT_TRUST' };
    }
    return { allowed: true, assessorId: userId, trustLevel, minimumTrustLevel };
  } catch {
    // Configuration, network and query failures never yield permission or leak details.
    return { allowed: false, reason: 'SERVICE_UNAVAILABLE' };
  }
}
