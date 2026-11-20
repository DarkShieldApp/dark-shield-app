import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../components/AuthProvider';
import SessionHeader from '../components/SessionHeader';
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
          <SessionHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
