import Link from 'next/link';
import { ReportForm } from '../../../components/ReportForm';

export default function NewReportPage() {
  return (
    <main className="page-container">
      <nav className="breadcrumb">
        <Link href="/" className="back-link">
          ← Volver al inicio
        </Link>
      </nav>

      <header className="page-header">
        <span className="badge">Nuevo reporte · HU-05</span>
        <h1>Reportar un posible Dark Pattern</h1>
        <p className="subtitle">
          Describe el comportamiento engañoso detectado en una página web para
          que la comunidad pueda revisarlo y valorarlo.
        </p>
      </header>

      <aside
        className="info-banner"
        aria-label="Aviso sobre reportes comunitarios"
      >
        <strong>Importante:</strong> Los reportes registran posibles patrones
        oscuros aportados por colaboradores y no constituyen una confirmación
        definitiva hasta su revisión.
      </aside>

      <ReportForm />
    </main>
  );
}
