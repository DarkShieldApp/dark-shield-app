import type { ReportSummaryItem } from '../lib/reports/query';
import {
  COMMUNITY_NOTICE,
  CREDIBILITY_DYNAMIC_NOTICE,
  toReportSummaryView,
  type CredibilityStatus,
} from '../lib/reports/summary';
import styles from './ReportSummaryCard.module.css';
import { ReportAssessmentControls } from './ReportAssessmentControls';

const CREDIBILITY_CLASS: Record<CredibilityStatus, string | undefined> = {
  high: styles.credibilityHigh,
  medium: styles.credibilityMedium,
  low: styles.credibilityLow,
  insufficient: styles.credibilityInsufficient,
  unavailable: styles.credibilityUnavailable,
};

interface ReportSummaryCardProps {
  report: ReportSummaryItem;
  /** Nivel del título dentro del listado (por defecto, h3 bajo un h2). */
  headingLevel?: 'h3' | 'h4';
}

/**
 * Resumen de un reporte en el listado de una página (HU-01/T6). Muestra solo
 * campos públicos y el estado de credibilidad como texto (HU-01/T7), con el
 * aviso de que es dinámico y una explicación agregada de los factores (HU-09/T3).
 */
export function ReportSummaryCard({
  report,
  headingLevel: Heading = 'h3',
}: ReportSummaryCardProps) {
  const view = toReportSummaryView(report);
  const titleId = `report-${view.id}-title`;

  return (
    <article
      id={`report-${view.id}`}
      className={styles.card}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={styles.header}>
        <span className={styles.category}>{view.categoryLabel}</span>
        <Heading id={titleId} className={styles.title}>
          {view.title}
        </Heading>
      </header>
      <dl className={styles.meta}>
        <div>
          <dt>Página afectada</dt>
          <dd className={styles.page}>{view.pageUrl}</dd>
        </div>
        <div>
          <dt>Fecha del reporte</dt>
          <dd>
            <time dateTime={view.dateTime}>{view.dateLabel}</time>
          </dd>
        </div>
        <div className={styles.credibilityGroup}>
          <dt>Credibilidad</dt>
          <dd className={styles.credibilityValue}>
            <span
              className={`${styles.credibility} ${CREDIBILITY_CLASS[view.credibility.status] ?? ''}`}
              data-credibility={view.credibility.status}
            >
              {view.credibility.label}
            </span>
            {view.credibility.status !== 'unavailable' && (
              <>
                <span className={styles.credibilityNotice}>
                  {CREDIBILITY_DYNAMIC_NOTICE}
                </span>
                <details className={styles.credibilityDetails}>
                  <summary>Cómo se calcula</summary>
                  {report.credibility?.factors ? (
                    <>
                      <p className={styles.factorsIntro}>
                        El nivel combina evidencias visibles y valoraciones de
                        personas activas. No se muestran identidades ni niveles
                        individuales de confianza.
                      </p>
                      <dl className={styles.factorsList}>
                        <div>
                          <dt>Evidencias visibles</dt>
                          <dd>{report.credibility.factors.visibleEvidences}</dd>
                          <small>
                            Cada una aporta 0,25 de apoyo; el conjunto tiene un
                            máximo de 1,00.
                          </small>
                        </div>
                        <div>
                          <dt>Validaciones</dt>
                          <dd>{report.credibility.factors.validations}</dd>
                          <small>
                            Se ponderan por la confianza actual de cada persona
                            valoradora.
                          </small>
                        </div>
                        <div>
                          <dt>Invalidaciones</dt>
                          <dd>{report.credibility.factors.invalidations}</dd>
                          <small>
                            Se ponderan por la confianza actual de cada persona
                            valoradora.
                          </small>
                        </div>
                        <div>
                          <dt>Personas valoradoras</dt>
                          <dd>{report.credibility.factors.assessors}</dd>
                          <small>
                            Cuenta la última valoración de cada persona activa;
                            no cuenta la del autor del reporte.
                          </small>
                        </div>
                        <div>
                          <dt>Peso a favor</dt>
                          <dd>
                            {report.credibility.factors.supportWeight.toLocaleString(
                              'es-ES',
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </dd>
                          <small>
                            Suma el apoyo de evidencias y validaciones
                            ponderadas.
                          </small>
                        </div>
                        <div>
                          <dt>Peso en contra</dt>
                          <dd>
                            {report.credibility.factors.againstWeight.toLocaleString(
                              'es-ES',
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </dd>
                          <small>
                            Suma el peso de las invalidaciones ponderadas.
                          </small>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className={styles.factorsIntro}>
                      El desglose de factores no está disponible para este
                      reporte.
                    </p>
                  )}
                </details>
              </>
            )}
          </dd>
        </div>
      </dl>
      <p className={styles.excerpt}>{view.excerpt}</p>
      <p className={styles.notice}>
        <span aria-hidden="true">✳</span> {COMMUNITY_NOTICE}
      </p>
      <ReportAssessmentControls reportId={view.id} />
    </article>
  );
}
