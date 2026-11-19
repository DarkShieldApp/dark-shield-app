import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-container">
      <section className="hero-card">
        <span className="badge">Plataforma Web</span>
        <h1>DarkShield</h1>
        <p className="subtitle">
          Consulta y reporta posibles patrones oscuros (dark patterns) en sitios
          web de forma colaborativa.
        </p>
        <div className="actions-row">
          <Link href="/reports/new" className="btn-primary">
            Crear nuevo reporte
          </Link>
        </div>
      </section>
    </main>
  );
}
