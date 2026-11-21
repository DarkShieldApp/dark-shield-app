'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { getAccessToken } from '../lib/supabase/session';
import {
  sendReportAssessment,
  type AssessmentAction,
  type AssessmentOutcome,
} from '../lib/reports/assessments';
import styles from './ReportAssessmentControls.module.css';

export function ReportAssessmentControls({ reportId }: { reportId: string }) {
  const auth = useAuth();
  // Changing account/report unmounts old state; a late result cannot belong to another card/account.
  return (
    <AssessmentControls
      key={`${reportId}:${auth.session?.user.id ?? 'guest'}`}
      reportId={reportId}
      auth={auth}
    />
  );
}

function AssessmentControls({
  reportId,
  auth,
}: {
  reportId: string;
  auth: ReturnType<typeof useAuth>;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<AssessmentOutcome | null>(null);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function submit(action: AssessmentAction) {
    if (locked.current || auth.isLoading || !auth.session || auth.error) return;
    locked.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const token = await getAccessToken();
      if (!active.current) return;
      const outcome = await sendReportAssessment(reportId, action, token);
      if (active.current) setFeedback(outcome);
    } catch {
      if (active.current)
        setFeedback({
          kind: 'error',
          requiresLogin: false,
          message:
            'No se pudo comprobar la sesión. No se ha enviado ninguna valoración. Inténtalo más tarde.',
        });
    } finally {
      locked.current = false;
      if (active.current) setPending(false);
    }
  }

  const needsLogin =
    !auth.session || (feedback?.kind === 'error' && feedback.requiresLogin);
  const disabled =
    pending || auth.isLoading || !auth.session || Boolean(auth.error);
  return (
    <section
      className={styles.controls}
      aria-label="Valorar este reporte"
      aria-busy={pending}
    >
      <div className={styles.actions}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void submit('validate')}
        >
          Validar reporte
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void submit('invalidate')}
        >
          Invalidar reporte
        </button>
      </div>
      <p
        className={styles.status}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending
          ? 'Guardando valoración…'
          : auth.isLoading
            ? 'Comprobando sesión…'
            : feedback?.kind === 'success'
              ? `${feedback.action === 'validate' ? 'Validación' : 'Invalidación'} registrada. La credibilidad se actualizará al realizar una nueva consulta.`
              : !auth.session
                ? 'Inicia sesión para validar o invalidar reportes.'
                : ''}
      </p>
      {auth.error ? (
        <p className={styles.error} role="alert">
          No se pudo comprobar la sesión. Inténtalo más tarde.
        </p>
      ) : (
        feedback?.kind === 'error' && (
          <p className={styles.error} role="alert">
            {feedback.message}
          </p>
        )
      )}
      {!auth.isLoading && needsLogin && (
        <Link className={styles.login} href="/login?next=%2Fconsulta">
          Iniciar sesión para valorar
        </Link>
      )}
    </section>
  );
}
