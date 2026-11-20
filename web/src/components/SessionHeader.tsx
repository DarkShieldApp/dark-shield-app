'use client';

import { usePathname } from 'next/navigation';
import AuthControls from './AuthControls';

export default function SessionHeader() {
  const pathname = usePathname();

  if (pathname === '/consulta') {
    return null;
  }

  return (
    <header className="site-header">
      <AuthControls />
    </header>
  );
}
