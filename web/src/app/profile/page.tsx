import styles from './profile.module.css';

// HU-10/T1: Profile view displaying user trust level.


const exampleProfile = {
  displayName: 'Usuario de ejemplo',
  roleName: 'Colaborador',
  trustLevel: 65,
};

export default function ProfilePage() {
  const { displayName, roleName, trustLevel } = exampleProfile;

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
          <h2 className={styles.sectionTitle}>
            Información de la cuenta
          </h2>

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
          <h2 className={styles.sectionTitle}>
            Nivel de confianza
          </h2>

          <div className={styles.trustHeader}>
            <span>Confianza actual</span>
            <strong className={styles.trustValue}>
              {trustLevel} / 100
            </strong>
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
            Tu nivel de confianza refleja tu puntuación
            dentro de Dark-Shield y podrá utilizarse para
            determinar las acciones que tienes permitidas.
          </p>
        </div>
      </section>
    </main>
  );
}
