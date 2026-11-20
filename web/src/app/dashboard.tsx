'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import Image from 'next/image';
import styles from './dashboard.module.css';
import { prepareReportDraft } from '../lib/reports/rules';
import {
  ALLOWED_EVIDENCE_TYPES,
  EVIDENCE_MAX_FILE_BYTES,
  EVIDENCE_MAX_FILES,
} from '../lib/evidences/rules';
import {
  EMPTY_EVIDENCE_SELECTION,
  EVIDENCE_ERROR_MESSAGES,
  addToEvidenceSelection,
  prepareEvidenceFiles,
  removeFromEvidenceSelection,
  type EvidenceSelection,
  type EvidenceSelectionItem,
} from '../lib/evidences/selection';
import {
  uploadEvidences,
  type EvidenceUploadState,
} from '../lib/evidences/upload';
import { getAccessToken } from '../lib/supabase/session';
import {
  resolveQueryState,
  type ReportQueryResult,
} from '../lib/reports/query';
import {
  describeQueryStatus,
  fetchReportsPage,
  mergeReportPages,
  prepareQueryTarget,
  type QueryFailure,
  type ReportSearchQuery,
} from '../lib/reports/search';
import { ReportSummaryCard } from '../components/ReportSummaryCard';

type Section = 'consulta' | 'crear' | 'evidencias';

const ACCEPTED_TYPES = ALLOWED_EVIDENCE_TYPES.map(
  ({ mimeType }) => mimeType,
).join(',');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reporte al que se aportan las evidencias: `?reporte=<uuid>` en la URL.
const noSubscription = () => () => {};
const readReportParam = () =>
  new URLSearchParams(window.location.search).get('reporte');
const noReportOnServer = () => null;

const RESULTS_HEADING_ID = 'report-results-heading';
const INVALID_QUERY_MESSAGE =
  'Introduce una URL válida con HTTP o HTTPS, sin usuario ni contraseña.';

const PHASE_LABELS: Record<string, string> = {
  requesting: 'Preparando la subida…',
  uploading: 'Subiendo…',
  confirming: 'Comprobando y guardando…',
  done: 'Guardada en el reporte',
};

function withoutKey<T>(record: Record<string, T>, key: string) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function isBusy(state: EvidenceUploadState | undefined) {
  return (
    state?.phase === 'requesting' ||
    state?.phase === 'uploading' ||
    state?.phase === 'confirming'
  );
}

export default function Dashboard() {
  const [section, setSection] = useState<Section>('consulta');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'page' | 'domain'>('page');
  const [queryInvalid, setQueryInvalid] = useState(false);
  const [activeQuery, setActiveQuery] = useState<ReportSearchQuery | null>(
    null,
  );
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<ReportQueryResult | null>(
    null,
  );
  const [queryError, setQueryError] = useState<QueryFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<QueryFailure | null>(null);
  // Cada petición de foco es un objeto nuevo, para que el efecto se repita.
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState({
    pageUrl: '',
    pattern: '',
    description: '',
  });
  const [feedback, setFeedback] = useState('');
  const [selection, setSelection] = useState<EvidenceSelection>(
    EMPTY_EVIDENCE_SELECTION,
  );
  const [uploads, setUploads] = useState<Record<string, EvidenceUploadState>>(
    {},
  );
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // URL de previsualización vivas, para liberarlas al desmontar.
  const previewUrls = useRef(new Set<string>());
  const [fileNotice, setFileNotice] = useState('');
  const reportParam = useSyncExternalStore(
    noSubscription,
    readReportParam,
    noReportOnServer,
  );
  const reportId = reportParam && UUID.test(reportParam) ? reportParam : null;

  const fileSummary = useMemo(
    () => selection.items.reduce((sum, { file }) => sum + file.size, 0),
    [selection],
  );
  const pending = selection.items.filter(
    (item) =>
      item.status === 'accepted' &&
      uploads[item.key]?.phase !== 'done' &&
      !isBusy(uploads[item.key]),
  );
  const busy = selection.items.some((item) => isBusy(uploads[item.key]));

  const queryView = resolveQueryState({
    isLoading: queryLoading,
    result: queryResult,
    error: queryError,
    query: activeQuery,
  });
  const moreView = moreError ? resolveQueryState({ error: moreError }) : null;
  const moreFailure = moreView?.status === 'error' ? moreView : null;

  useEffect(() => {
    const active = previewUrls.current;
    return () => active.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => searchAbort.current?.abort(), []);

  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  function focusQueryInput() {
    document.getElementById('query')?.focus();
  }

  // Consulta de solo lectura (HU-01/T4 y T9): una búsqueda nueva cancela la
  // anterior y su paginación para que no se mezclen respuestas.
  async function runSearch(next: ReportSearchQuery) {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setActiveQuery(next);
    setQueryLoading(true);
    setQueryResult(null);
    setQueryError(null);
    setLoadingMore(false);
    setMoreError(null);
    const outcome = await fetchReportsPage(next, null, {
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setQueryLoading(false);
    setQueryResult(outcome.result ?? null);
    setQueryError(outcome.error ?? null);
    setFocusRequest({ id: RESULTS_HEADING_ID });
  }

  async function loadMore() {
    const cursor = queryResult?.nextCursor;
    const signal = searchAbort.current?.signal;
    if (!activeQuery || !queryResult || !cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const outcome = await fetchReportsPage(activeQuery, cursor, { signal });
    if (signal?.aborted) return;
    setLoadingMore(false);
    if (outcome.error) {
      setMoreError(outcome.error);
      return;
    }
    const merged = mergeReportPages(queryResult, outcome.result);
    setQueryResult(merged);
    const firstNew = merged.items[queryResult.items.length];
    if (firstNew) setFocusRequest({ id: `report-${firstNew.id}` });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = prepareQueryTarget(query, scope);
    if (!target) {
      setQueryInvalid(true);
      return;
    }
    setQueryInvalid(false);
    if (scope === 'domain') setQuery(target);
    void runSearch({ scope, target });
  }

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const prepared = await prepareEvidenceFiles(Array.from(input.files ?? []));
    input.value = '';
    const { selection: next, duplicates } = addToEvidenceSelection(
      selection,
      prepared,
    );
    const created: Record<string, string> = {};
    for (const { key, file } of next.items) {
      if (!previews[key]) {
        created[key] = URL.createObjectURL(file);
        previewUrls.current.add(created[key]);
      }
    }
    setPreviews((current) => ({ ...current, ...created }));
    setSelection(next);
    setFileNotice(
      duplicates.length > 0
        ? `${duplicates.length} archivo(s) ya estaban seleccionados y no se han repetido.`
        : '',
    );
  }

  function removeFile(key: string) {
    const preview = previews[key];
    if (preview) {
      URL.revokeObjectURL(preview);
      previewUrls.current.delete(preview);
    }
    setPreviews((current) => withoutKey(current, key));
    setSelection(removeFromEvidenceSelection(selection, key));
    setUploads((current) => withoutKey(current, key));
  }

  async function send(items: readonly EvidenceSelectionItem[]) {
    if (!reportId || items.length === 0) return;
    await uploadEvidences(reportId, items, {
      getAccessToken: () => getAccessToken(),
      onChange: (key, state) =>
        setUploads((current) => ({ ...current, [key]: state })),
    });
  }

  function statusOf(item: EvidenceSelectionItem) {
    if (item.status === 'rejected') {
      return { text: EVIDENCE_ERROR_MESSAGES[item.code], error: true };
    }
    const state = uploads[item.key];
    if (!state) return { text: 'Lista para subir', error: false };
    if (state.phase === 'error')
      return { text: state.error.message, error: true };
    return { text: PHASE_LABELS[state.phase] ?? '', error: false };
  }

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = prepareReportDraft(draft);
    if (!result.ok) {
      setFeedback(Object.values(result.errors).join(' '));
      return;
    }
    setFeedback(
      'Borrador válido en esta sesión. El envío al servidor aún no está conectado.',
    );
  }

  const titles: Record<Section, string> = {
    consulta: 'Explora reportes',
    crear: 'Comparte un reporte',
    evidencias: 'Aporta evidencias',
  };

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <a
          className={styles.brand}
          href="#inicio"
          onClick={() => setSection('consulta')}
        >
          <span className={styles.brandMark}>D</span>
          <span>
            darkshield<small>TRANSPARENCIA DIGITAL</small>
          </span>
        </a>
        <div className={styles.navLabel}>ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          <button
            className={
              section === 'consulta' ? styles.activeNav : styles.navItem
            }
            onClick={() => setSection('consulta')}
          >
            <span>⌕</span> Consultar reportes
          </button>
          <button
            className={section === 'crear' ? styles.activeNav : styles.navItem}
            onClick={() => setSection('crear')}
          >
            <span>＋</span> Crear reporte
          </button>
          <button
            className={
              section === 'evidencias' ? styles.activeNav : styles.navItem
            }
            onClick={() => setSection('evidencias')}
          >
            <span>▧</span> Evidencias
          </button>
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.avatar}>M</div>
          <div>
            <b>Modo invitado</b>
            <small>Sesión no iniciada</small>
          </div>
          <span className={styles.chevron}>⌄</span>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            DarkShield <span>/</span> {titles[section]}
          </div>
          <div className={styles.topActions}>
            <span className={styles.status}>
              <i /> Comunidad abierta
            </span>
            <button className={styles.profileButton} aria-label="Perfil">
              M
            </button>
          </div>
        </header>
        <div className={styles.page}>
          <div className={styles.pageHeading}>
            <div>
              <div className={styles.eyebrow}>
                PLATAFORMA DE INFORMACIÓN COMUNITARIA
              </div>
              <h1>{titles[section]}</h1>
              <p>
                Información compartida sobre experiencias digitales, con
                contexto y evidencias.
              </p>
            </div>
            <button
              className={styles.primaryButton}
              onClick={() => setSection('crear')}
            >
              <span>＋</span> Nuevo reporte
            </button>
          </div>

          {section === 'consulta' && (
            <>
              <section className={styles.searchCard}>
                <div className={styles.searchTitle}>
                  <div className={styles.searchIcon}>⌕</div>
                  <div>
                    <h2>¿Qué página quieres consultar?</h2>
                    <p>
                      Busca por una URL concreta o por el dominio de un sitio.
                    </p>
                  </div>
                </div>
                <div
                  className={styles.scopeSwitch}
                  role="group"
                  aria-label="Ámbito de búsqueda"
                >
                  <button
                    type="button"
                    className={
                      scope === 'page' ? styles.scopeActive : styles.scopeButton
                    }
                    onClick={() => {
                      setScope('page');
                      setQueryInvalid(false);
                    }}
                  >
                    Página
                  </button>
                  <button
                    type="button"
                    className={
                      scope === 'domain'
                        ? styles.scopeActive
                        : styles.scopeButton
                    }
                    onClick={() => {
                      setScope('domain');
                      setQueryInvalid(false);
                    }}
                  >
                    Dominio
                  </button>
                </div>
                <form className={styles.searchForm} onSubmit={search}>
                  <label className={styles.srOnly} htmlFor="query">
                    {scope === 'page' ? 'URL de página' : 'Dominio o URL'}
                  </label>
                  <span className={styles.inputIcon}>↗</span>
                  <input
                    id="query"
                    aria-invalid={queryInvalid}
                    aria-describedby="query-hint"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setQueryInvalid(false);
                    }}
                    placeholder={
                      scope === 'page'
                        ? 'https://ejemplo.com/pagina'
                        : 'ejemplo.com'
                    }
                  />
                  <button className={styles.primaryButton} type="submit">
                    Consultar <span>→</span>
                  </button>
                </form>
                <div className={styles.searchHint} id="query-hint">
                  <span>ⓘ</span> La consulta es de solo lectura. Los reportes
                  reflejan experiencias comunicadas por la comunidad.
                </div>
              </section>
              <div className={styles.listHeading}>
                <div>
                  <h2 id={RESULTS_HEADING_ID} tabIndex={-1}>
                    Reportes de la comunidad
                  </h2>
                  <p>
                    {activeQuery
                      ? `Resultados para ${activeQuery.scope === 'page' ? 'la página' : 'el dominio'} ${activeQuery.target}`
                      : 'Consulta información asociada a una página.'}
                  </p>
                </div>
                <button className={styles.filterButton} disabled>
                  ↕ <span>Más recientes</span>
                </button>
              </div>
              <p className={styles.srOnly} role="status">
                {queryInvalid
                  ? INVALID_QUERY_MESSAGE
                  : describeQueryStatus(queryView)}
              </p>
              {!queryInvalid && queryView.status === 'success' ? (
                <>
                  <ul
                    className={styles.reportList}
                    aria-labelledby={RESULTS_HEADING_ID}
                  >
                    {queryView.items.map((item) => (
                      <li key={item.id}>
                        <ReportSummaryCard report={item} />
                      </li>
                    ))}
                  </ul>
                  {(queryView.nextCursor || moreFailure) && (
                    <div className={styles.loadMore}>
                      {moreFailure && (
                        <p className={styles.error}>{moreFailure.message}</p>
                      )}
                      {queryView.nextCursor &&
                        (!moreFailure || moreFailure.canRetry) && (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={loadingMore}
                            onClick={loadMore}
                          >
                            {loadingMore
                              ? 'Cargando…'
                              : moreFailure
                                ? 'Reintentar'
                                : 'Cargar más'}
                          </button>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <section
                  className={styles.emptyCard}
                  aria-labelledby="query-state-title"
                  aria-busy={queryView.status === 'loading'}
                >
                  <div className={styles.emptyIllustration} aria-hidden="true">
                    <div className={styles.orbit}>⌕</div>
                    <span className={styles.sparkle}>✳</span>
                    <span className={styles.dot}>•</span>
                  </div>
                  {queryInvalid ? (
                    <>
                      <h3 id="query-state-title">Revisa la dirección</h3>
                      <p>{INVALID_QUERY_MESSAGE}</p>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={focusQueryInput}
                      >
                        Corregir la dirección <span>→</span>
                      </button>
                    </>
                  ) : queryView.status === 'loading' ? (
                    <>
                      <h3 id="query-state-title">Buscando reportes…</h3>
                      <p>
                        Consultando los reportes publicados para{' '}
                        {activeQuery?.target}.
                      </p>
                    </>
                  ) : queryView.status === 'empty' ? (
                    <>
                      <h3 id="query-state-title">
                        Sin reportes para esta búsqueda
                      </h3>
                      <p>
                        {queryView.message} Que no haya reportes no significa
                        que la página esté libre de patrones oscuros.
                      </p>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={focusQueryInput}
                      >
                        Probar otra dirección <span>→</span>
                      </button>
                    </>
                  ) : queryView.status === 'error' ? (
                    <>
                      <h3 id="query-state-title">
                        No se pudo completar la consulta
                      </h3>
                      <p>{queryView.message}</p>
                      {queryView.canRetry && activeQuery ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => void runSearch(activeQuery)}
                        >
                          Reintentar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={focusQueryInput}
                        >
                          Corregir la búsqueda <span>→</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <h3 id="query-state-title">Empieza con una búsqueda</h3>
                      <p>
                        Introduce la dirección de una página para buscar
                        reportes relacionados.
                      </p>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={focusQueryInput}
                      >
                        Introducir una dirección <span>→</span>
                      </button>
                    </>
                  )}
                </section>
              )}
              <div className={styles.disclaimer}>
                <span>✳</span>
                <p>
                  <b>Información para explorar, no veredictos.</b> Un reporte
                  describe una experiencia que alguien ha comunicado. La
                  consulta no confirma por sí misma que una práctica esté
                  presente.
                </p>
              </div>
            </>
          )}

          {section === 'crear' && (
            <>
              <section className={styles.formCard}>
                <div className={styles.cardHeading}>
                  <div className={styles.stepBadge}>01</div>
                  <div>
                    <h2>Describe tu experiencia</h2>
                    <p>Cuéntale a la comunidad qué ocurrió en esta página.</p>
                  </div>
                </div>
                <form className={styles.reportForm} onSubmit={submitReport}>
                  <label>
                    URL de la página <span>OBLIGATORIO</span>
                    <input
                      value={draft.pageUrl}
                      onChange={(e) =>
                        setDraft({ ...draft, pageUrl: e.target.value })
                      }
                      placeholder="https://ejemplo.com/checkout"
                    />
                  </label>
                  <label>
                    Tipo de patrón <span>OBLIGATORIO</span>
                    <select
                      value={draft.pattern}
                      onChange={(e) =>
                        setDraft({ ...draft, pattern: e.target.value })
                      }
                    >
                      <option value="">
                        Selecciona el patrón que observaste
                      </option>
                      <option>Costes ocultos</option>
                      <option>Interferencia visual</option>
                      <option>Urgencia artificial</option>
                      <option>Suscripción difícil de cancelar</option>
                      <option>Otro patrón</option>
                    </select>
                  </label>
                  <label>
                    ¿Qué sucedió? <span>OBLIGATORIO</span>
                    <textarea
                      rows={5}
                      maxLength={2000}
                      value={draft.description}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      placeholder="Describe los pasos que seguiste y qué te resultó confuso o inesperado…"
                    />
                    <small>
                      Entre 20 y 2000 caracteres. Evita incluir datos
                      personales.
                    </small>
                  </label>
                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setSection('evidencias')}
                    >
                      Añadir evidencias <span>↗</span>
                    </button>
                    <button className={styles.primaryButton} type="submit">
                      Revisar borrador <span>→</span>
                    </button>
                  </div>
                  {feedback && (
                    <p
                      className={
                        feedback.startsWith('Borrador')
                          ? styles.success
                          : styles.error
                      }
                      role="status"
                    >
                      {feedback}
                    </p>
                  )}
                </form>
              </section>
              <div className={styles.notice}>
                <span>ⓘ</span>
                <p>
                  El formulario comprueba el borrador en tu navegador. El envío
                  y la publicación requieren una API que aún está pendiente.
                </p>
              </div>
            </>
          )}

          {section === 'evidencias' && (
            <>
              <section className={styles.formCard}>
                <div className={styles.cardHeading}>
                  <div className={styles.stepBadge}>02</div>
                  <div>
                    <h2>Adjunta archivos de apoyo</h2>
                    <p>
                      Las capturas ayudan a entender el contexto del reporte.
                    </p>
                  </div>
                </div>
                <label className={styles.uploadZone}>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    disabled={busy}
                    onChange={selectFiles}
                  />
                  <span className={styles.uploadIcon}>↑</span>
                  <b>
                    Arrastra archivos aquí o <u>explora tu dispositivo</u>
                  </b>
                  <small>
                    PNG, JPG o WEBP · hasta {EVIDENCE_MAX_FILES} archivos ·{' '}
                    {EVIDENCE_MAX_FILE_BYTES / (1024 * 1024)} MB por archivo
                  </small>
                </label>
                {fileNotice && (
                  <p className={styles.error} role="status">
                    {fileNotice}
                  </p>
                )}
                {selection.items.length > 0 && (
                  <div className={styles.fileList}>
                    <div className={styles.filesHeading}>
                      <b>
                        Archivos seleccionados{' '}
                        <span>{selection.items.length}</span>
                      </b>
                      <small>
                        {(fileSummary / (1024 * 1024)).toFixed(2)} MB en total
                      </small>
                    </div>
                    {selection.items.map((item) => {
                      const { key, file } = item;
                      const state = uploads[key];
                      const status = statusOf(item);
                      const preview = previews[key];
                      return (
                        <div className={styles.fileRow} key={key}>
                          {preview && (
                            <Image
                              src={preview}
                              alt={`Vista previa de ${file.name}`}
                              width={39}
                              height={39}
                              unoptimized
                            />
                          )}
                          <div className={styles.fileDetails}>
                            <b>{file.name}</b>
                            <small
                              className={
                                status.error ? styles.error : undefined
                              }
                              role={status.error ? 'alert' : 'status'}
                            >
                              {(file.size / 1024).toFixed(0)} KB · {status.text}
                            </small>
                          </div>
                          {state?.phase === 'error' &&
                            state.error.retryable && (
                              <button
                                className={styles.secondaryButton}
                                type="button"
                                disabled={busy}
                                onClick={() => send([item])}
                              >
                                Reintentar
                              </button>
                            )}
                          <span className={styles.localTag}>
                            {state?.phase === 'done'
                              ? 'Guardada'
                              : isBusy(state)
                                ? 'Subiendo'
                                : 'Local'}
                          </span>
                          <button
                            className={styles.removeButton}
                            type="button"
                            aria-label={`Quitar ${file.name}`}
                            disabled={isBusy(state)}
                            onClick={() => removeFile(key)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setSection('crear')}
                  >
                    ← Volver al reporte
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!reportId || busy || pending.length === 0}
                    onClick={() => send(pending)}
                  >
                    {busy ? 'Subiendo…' : 'Subir evidencias'}
                  </button>
                </div>
              </section>
              <div className={styles.notice}>
                <span>ⓘ</span>
                <p>
                  {reportId
                    ? 'Los archivos se suben directamente al almacenamiento privado. El servidor comprueba cada uno y elimina sus metadatos (EXIF y ubicación GPS) antes de guardarlo. Necesitas haber iniciado sesión como colaborador.'
                    : 'Abre esta sección desde un reporte para aportar evidencias: falta el identificador del reporte (?reporte=…).'}
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
