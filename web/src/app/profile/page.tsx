import type { ProfileData } from './profile-data';
import ProfileView from './profile-view';

// HU-10/T3: Profile page with temporary development data.
// Real authenticated data will be integrated with HU-11.

const exampleData: ProfileData = {
  profile: {
    id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Usuario de ejemplo',
    trust_level: 65,
    is_active: true,
    role_code: 'collaborator',
    created_at: '2026-11-19T10:00:00Z',
    updated_at: '2026-11-19T10:00:00Z',
  },
  authorization: {
    roleCode: 'collaborator',
    permissions: ['reports.create', 'evidences.add', 'assessments.submit'],
  },
};

export default function ProfilePage() {
  return <ProfileView data={exampleData} />;
}
