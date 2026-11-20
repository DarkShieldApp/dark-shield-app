import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AuthControls from '../components/AuthControls';
import { AuthProvider } from '../components/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DarkShield',
  description:
    'Plataforma colaborativa para reportar y consultar dark patterns',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <header className="site-header">
            <AuthControls />
          </header>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
