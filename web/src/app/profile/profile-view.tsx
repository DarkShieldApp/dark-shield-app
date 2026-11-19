import type { RoleCode } from '../../server/profiles';
import type { ProfileData } from './profile-data';
import { getAllowedActions } from './permission-actions';
import styles from './profile.module.css';

// HU-10/T3: Render profile data and effective permissions.

const roleNames: Record<RoleCode, string> = {
  collaborator: 'Colaborador',
  developer: 'Desarrollador',
  admin: 'Administrador',
};

type ProfileViewProps = {
  data: ProfileData;
};

export default function ProfileView({ data }: ProfileViewProps) {
  const { profile, authorization } = data;

  const displayName = profile.display_name ?? 'Usuario';
  const roleName = roleNames[authorization.roleCode];
  const trustLevel = profile.trust_level;
  const allowedActions = getAllowedActions(authorization);

  return (
    <main className={styles.container}>
      <section className={styles.profileCard}>
        <header className={styles.header}>
          <div className={styles.avatar} aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div>
            <h1 className={styles.title}>Mi perfil</h1>
            <p className={styles.username}>{displayName}</p>
          </div>
        </header>

        <div className={styles.infoSection}>
          <h2 className={styles.sectionTitle}>Información de la cuenta</h2>

          <div className={styles.infoRow}>
            <span>Nombre de usuario</span>
            <strong>{displayName}</strong>
          </div>

          <div className={styles.infoRow}>
            <span>Rol</span>
            <span className={styles.roleBadge}>{roleName}</span>
          </div>
        </div>

        <div className={styles.trustSection}>
          <h2 className={styles.sectionTitle}>Nivel de confianza</h2>

          <div className={styles.trustHeader}>
            <span>Confianza actual</span>
            <strong className={styles.trustValue}>{trustLevel} / 100</strong>
          </div>

          <div
            className={styles.progressBar}
            role="progressbar"
            aria-label="Nivel de confianza"
            aria-valuenow={trustLevel}
            aria-valuemin={1}
            aria-valuemax={100}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${trustLevel}%` }}
            />
          </div>

          <p className={styles.description}>
            Tu nivel de confianza refleja tu puntuación dentro de Dark-Shield.
          </p>
        </div>

        <div className={styles.actionsSection}>
          <h2 className={styles.sectionTitle}>Acciones permitidas</h2>

          {allowedActions.length > 0 ? (
            <ul className={styles.actionsList}>
              {allowedActions.map((action) => (
                <li key={action.code} className={styles.actionItem}>
                  {action.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyActions}>
              No tienes acciones disponibles actualmente.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
