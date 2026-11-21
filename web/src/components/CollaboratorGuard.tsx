'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { isActiveCollaborator } from '../lib/auth/collaborator';

type AccessState = {
  accessToken: string;
  status: 'allowed' | 'forbidden' | 'unavailable';
};

export default function CollaboratorGuard({
  children,
}: {
  children: ReactNode;
}) {
  const { session, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<AccessState | null>(null);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!session) {
      const returnPath =
        typeof window === 'undefined'
          ? pathname
          : `${pathname}${window.location.search}${window.location.hash}`;
      const query = new URLSearchParams({ next: returnPath });
      router.replace(`/login?${query.toString()}`);
      return;
    }

    let active = true;
    void fetch('/api/me/profile', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!active) {
          return;
        }

        if (response.status === 401) {
          const returnPath = `${pathname}${window.location.search}${window.location.hash}`;
          const query = new URLSearchParams({ next: returnPath });
          setAccess({ accessToken: session.access_token, status: 'forbidden' });
          router.replace(`/login?${query.toString()}`);
          return;
        }

        if (response.status === 403) {
          setAccess({ accessToken: session.access_token, status: 'forbidden' });
          return;
        }

        if (!response.ok) {
          setAccess({
            accessToken: session.access_token,
            status: 'unavailable',
          });
          return;
        }

        const profile: unknown = await response.json();
        setAccess({
          accessToken: session.access_token,
          status: isActiveCollaborator(profile) ? 'allowed' : 'forbidden',
        });
      })
      .catch(() => {
        if (active) {
          setAccess({
            accessToken: session.access_token,
            status: 'unavailable',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [isLoading, pathname, router, session]);

  if (isLoading || !session) {
    return <p role="status">Comprobando acceso de colaborador…</p>;
  }

  if (!access || access.accessToken !== session.access_token) {
    return <p role="status">Comprobando permisos…</p>;
  }

  if (access.status === 'forbidden') {
    return (
      <div className="page-container">
        <p className="error-summary" role="alert">
          Esta funcionalidad está disponible para cuentas activas con rol de
          colaborador.
        </p>
        <Link href="/consulta" className="back-link">
          Volver a consultar reportes
        </Link>
      </div>
    );
  }

  if (access.status === 'unavailable') {
    return (
      <div className="page-container">
        <p className="error-summary" role="alert">
          No se pudo comprobar el acceso. Inténtalo de nuevo más tarde.
        </p>
      </div>
    );
  }

  return children;
}
