'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import styles from './dashboard.module.css';
import { prepareReportDraft } from '../lib/reports/rules';

type Section = 'consulta' | 'crear' | 'evidencias';

export default function Dashboard() {
  const [section, setSection] = useState<Section>('consulta');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'page' | 'domain'>('page');
  const [queryState, setQueryState] = useState<'idle' | 'invalid' | 'disconnected'>('idle');
  const [draft, setDraft] = useState({ pageUrl: '', pattern: '', description: '' });
  const [feedback, setFeedback] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; preview: string }[]>([]);
  const files = selectedFiles.map(({ file }) => file);
  const previews = selectedFiles.map(({ preview }) => preview);
  const activePreviews = useRef<string[]>([]);
  const [fileNotice, setFileNotice] = useState('');

  const fileSummary = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => () => activePreviews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = query.trim();
    if (!target) { setQueryState('invalid'); return; }
    try {
      const url = new URL(target.includes('://') ? target : `https://${target}`);
      if (!['http:', 'https:'].includes(url.protocol)) { setQueryState('invalid'); return; }
      if (scope === 'domain') setQuery(url.hostname);
      setQueryState('disconnected');
    } catch { setQueryState('invalid'); }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 5) setFileNotice('Puedes seleccionar hasta 5 archivos. Revisa la selección.');
    else if (selected.some((file) => file.size > 10 * 1024 * 1024)) setFileNotice('Hay archivos que superan 10 MB. El servidor deberá validarlos al implementar la carga.');
    else if (selected.some((file) => !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type))) setFileNotice('Hay un formato no admitido. Se permiten PNG, JPG, WEBP y PDF.');
    else setFileNotice('');
    activePreviews.current.forEach((url) => URL.revokeObjectURL(url));
    const prepared = selected.slice(0, 5).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    activePreviews.current = prepared.map(({ preview }) => preview);
    setSelectedFiles(prepared);
  }

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = prepareReportDraft(draft);
    if (!result.ok) {
      setFeedback(Object.values(result.errors).join(' '));
      return;
    }
    setFeedback('Borrador válido en esta sesión. El envío al servidor aún no está conectado.');
  }

  const titles: Record<Section, string> = { consulta: 'Explora reportes', crear: 'Comparte un reporte', evidencias: 'Aporta evidencias' };

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="#inicio" onClick={() => setSection('consulta')}><span className={styles.brandMark}>D</span><span>darkshield<small>TRANSPARENCIA DIGITAL</small></span></a>
        <div className={styles.navLabel}>ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          <button className={section === 'consulta' ? styles.activeNav : styles.navItem} onClick={() => setSection('consulta')}><span>⌕</span> Consultar reportes</button>
          <button className={section === 'crear' ? styles.activeNav : styles.navItem} onClick={() => setSection('crear')}><span>＋</span> Crear reporte</button>
          <button className={section === 'evidencias' ? styles.activeNav : styles.navItem} onClick={() => setSection('evidencias')}><span>▧</span> Evidencias</button>
        </nav>
        <div className={styles.sidebarBottom}><div className={styles.avatar}>M</div><div><b>Modo invitado</b><small>Sesión no iniciada</small></div><span className={styles.chevron}>⌄</span></div>
      </aside>

      <section className={styles.content}>
        <header className={styles.topbar}><div className={styles.breadcrumb}>DarkShield <span>/</span> {titles[section]}</div><div className={styles.topActions}><span className={styles.status}><i /> Comunidad abierta</span><button className={styles.profileButton} aria-label="Perfil">M</button></div></header>
        <div className={styles.page}>
          <div className={styles.pageHeading}><div><div className={styles.eyebrow}>PLATAFORMA DE INFORMACIÓN COMUNITARIA</div><h1>{titles[section]}</h1><p>Información compartida sobre experiencias digitales, con contexto y evidencias.</p></div><button className={styles.primaryButton} onClick={() => setSection('crear')}><span>＋</span> Nuevo reporte</button></div>

          {section === 'consulta' && <>
            <section className={styles.searchCard}>
              <div className={styles.searchTitle}><div className={styles.searchIcon}>⌕</div><div><h2>¿Qué página quieres consultar?</h2><p>Busca por una URL concreta o por el dominio de un sitio.</p></div></div>
              <div className={styles.scopeSwitch} role="group" aria-label="Ámbito de búsqueda"><button type="button" className={scope === 'page' ? styles.scopeActive : styles.scopeButton} onClick={() => { setScope('page'); setQueryState('idle'); }}>Página</button><button type="button" className={scope === 'domain' ? styles.scopeActive : styles.scopeButton} onClick={() => { setScope('domain'); setQueryState('idle'); }}>Dominio</button></div>
              <form className={styles.searchForm} onSubmit={search}><label className={styles.srOnly} htmlFor="query">{scope === 'page' ? 'URL de página' : 'Dominio o URL'}</label><span className={styles.inputIcon}>↗</span><input id="query" value={query} onChange={(event) => { setQuery(event.target.value); setQueryState('idle'); }} placeholder={scope === 'page' ? 'https://ejemplo.com/pagina' : 'ejemplo.com'}/><button className={styles.primaryButton} type="submit">Consultar <span>→</span></button></form>
              <div className={styles.searchHint}><span>ⓘ</span> La consulta es de solo lectura. Los reportes reflejan experiencias comunicadas por la comunidad.</div>
            </section>
            <div className={styles.listHeading}><div><h2>Reportes de la comunidad</h2><p>{queryState === 'disconnected' ? `Búsqueda preparada para ${query}` : 'Consulta información asociada a una página.'}</p></div><button className={styles.filterButton} disabled>↕ <span>Más recientes</span></button></div>
            <section className={styles.emptyCard}>
              <div className={styles.emptyIllustration}><div className={styles.orbit}>⌕</div><span className={styles.sparkle}>✳</span><span className={styles.dot}>•</span></div>
              <h3>{queryState === 'disconnected' ? 'Consulta lista para conectar' : queryState === 'invalid' ? 'Revisa la dirección' : 'Empieza con una búsqueda'}</h3>
              <p>{queryState === 'disconnected' ? 'La API de reportes todavía no está implementada. No se han cargado resultados.' : queryState === 'invalid' ? 'Introduce una URL válida con HTTP o HTTPS para preparar la consulta.' : 'Introduce la dirección de una página para buscar reportes relacionados.'}</p>
              {queryState === 'disconnected' ? <span className={styles.pendingTag}><i /> API pendiente de conexión</span> : <button className={styles.textButton} onClick={() => document.getElementById('query')?.focus()}>Introducir una dirección <span>→</span></button>}
            </section>
            <div className={styles.disclaimer}><span>✳</span><p><b>Información para explorar, no veredictos.</b> Un reporte describe una experiencia que alguien ha comunicado. La consulta no confirma por sí misma que una práctica esté presente.</p></div>
          </>}

          {section === 'crear' && <>
            <section className={styles.formCard}><div className={styles.cardHeading}><div className={styles.stepBadge}>01</div><div><h2>Describe tu experiencia</h2><p>Cuéntale a la comunidad qué ocurrió en esta página.</p></div></div>
              <form className={styles.reportForm} onSubmit={submitReport}>
                <label>URL de la página <span>OBLIGATORIO</span><input value={draft.pageUrl} onChange={(e) => setDraft({ ...draft, pageUrl: e.target.value })} placeholder="https://ejemplo.com/checkout" /></label>
                <label>Tipo de patrón <span>OBLIGATORIO</span><select value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}><option value="">Selecciona el patrón que observaste</option><option>Costes ocultos</option><option>Interferencia visual</option><option>Urgencia artificial</option><option>Suscripción difícil de cancelar</option><option>Otro patrón</option></select></label>
                <label>¿Qué sucedió? <span>OBLIGATORIO</span><textarea rows={5} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Describe los pasos que seguiste y qué te resultó confuso o inesperado…"/><small>Entre 20 y 2000 caracteres. Evita incluir datos personales.</small></label>
                <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setSection('evidencias')}>Añadir evidencias <span>↗</span></button><button className={styles.primaryButton} type="submit">Revisar borrador <span>→</span></button></div>
                {feedback && <p className={feedback.startsWith('Borrador') ? styles.success : styles.error} role="status">{feedback}</p>}
              </form>
            </section>
            <div className={styles.notice}><span>ⓘ</span><p>El formulario comprueba el borrador en tu navegador. El envío y la publicación requieren una API que aún está pendiente.</p></div>
          </>}

          {section === 'evidencias' && <>
            <section className={styles.formCard}><div className={styles.cardHeading}><div className={styles.stepBadge}>02</div><div><h2>Adjunta archivos de apoyo</h2><p>Las capturas ayudan a entender el contexto del reporte.</p></div></div>
              <label className={styles.uploadZone}><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={selectFiles}/><span className={styles.uploadIcon}>↑</span><b>Arrastra archivos aquí o <u>explora tu dispositivo</u></b><small>PNG, JPG, WEBP o PDF · hasta 5 archivos · 10 MB por archivo</small></label>
              {fileNotice && <p className={styles.error} role="status">{fileNotice}</p>}
              {files.length > 0 && <div className={styles.fileList}><div className={styles.filesHeading}><b>Archivos seleccionados <span>{files.length}</span></b><small>{(fileSummary / (1024 * 1024)).toFixed(2)} MB en total</small></div>{files.map((file, index) => <div className={styles.fileRow} key={`${file.name}-${index}`}>{file.type.startsWith('image/') && previews[index] ? <img src={previews[index]} alt={`Vista previa de ${file.name}`} /> : <div className={styles.pdfIcon}>{file.type === 'application/pdf' ? 'PDF' : 'FILE'}</div>}<div className={styles.fileDetails}><b><a href={previews[index]} target="_blank" rel="noreferrer">{file.name}</a></b><small>{(file.size / 1024).toFixed(0)} KB · Seleccionado localmente · Abrir vista</small></div><span className={styles.localTag}>Local</span><button className={styles.removeButton} type="button" aria-label={`Quitar ${file.name}`} onClick={() => { URL.revokeObjectURL(previews[index]); activePreviews.current = activePreviews.current.filter((url) => url !== previews[index]); setSelectedFiles(selectedFiles.filter((_, i) => i !== index)); }}>×</button></div>)}</div>}
              <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setSection('crear')}>← Volver al reporte</button><span className={styles.localNote}>Los archivos no se han subido.</span></div>
            </section>
            <div className={styles.notice}><span>ⓘ</span><p>La previsualización se genera solo en este navegador. La validación y el almacenamiento seguros del archivo se harán en el servidor al implementar HU-06/T3–T4.</p></div>
          </>}
        </div>
      </section>
    </main>
  );
}
