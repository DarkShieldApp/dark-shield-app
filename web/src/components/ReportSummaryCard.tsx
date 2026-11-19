import type { ReportSummaryItem } from '../lib/reports/query';
import {
  COMMUNITY_NOTICE,
  CREDIBILITY_UNAVAILABLE,
  toReportSummaryView,
} from '../lib/reports/summary';
import styles from './ReportSummaryCard.module.css';

interface ReportSummaryCardProps {
  report: ReportSummaryItem;
  /** Nivel del título dentro del listado (por defecto, h3 bajo un h2). */
  headingLevel?: 'h3' | 'h4';
}

/**
 * Resumen de un reporte en el listado de una página (HU-01/T6). Muestra solo
 * campos públicos y no infiere la credibilidad: el hueco lo completa
 * HU-01/T7 con los datos de HU-09.
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
        <div>
          <dt>Credibilidad</dt>
          <dd className={styles.credibility}>{CREDIBILITY_UNAVAILABLE}</dd>
        </div>
      </dl>
      <p className={styles.excerpt}>{view.excerpt}</p>
      <p className={styles.notice}>
        <span aria-hidden="true">✳</span> {COMMUNITY_NOTICE}
      </p>
    </article>
  );
}
