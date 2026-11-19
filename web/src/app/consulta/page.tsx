import type { Metadata } from 'next';
import Dashboard from '../dashboard';

export const metadata: Metadata = {
  title: 'Consultar reportes · DarkShield',
};

// HU-01/T4 y T6: buscador y listado de reportes de una página o dominio.
export default function ConsultaPage() {
  return <Dashboard />;
}
