'use client';

import { useState, type FormEvent } from 'react';

interface CategoryOption {
  readonly value: string;
  readonly label: string;
}

const DARK_PATTERN_CATEGORIES: readonly CategoryOption[] = [
  {
    value: 'roach_motel',
    label: 'Suscripción difícil de cancelar (Roach Motel)',
  },
  {
    value: 'hidden_costs',
    label: 'Costes ocultos o cargos sorpresa (Hidden Costs)',
  },
  { value: 'false_urgency', label: 'Urgencia o escasez falsa (False Urgency)' },
  {
    value: 'sneaking',
    label: 'Preselección o elementos añadidos sin permiso (Sneaking)',
  },
  { value: 'confirmshaming', label: 'Manipulación emocional (Confirmshaming)' },
  {
    value: 'trick_questions',
    label: 'Interfaz o redacción confusa (Trick Questions)',
  },
  { value: 'other', label: 'Otro patrón oscuro' },
];

export function ReportForm() {
  const [targetUrl, setTargetUrl] = useState('');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [submittedDraft, setSubmittedDraft] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedDraft(true);
  }

  function handleReset() {
    setTargetUrl('');
    setCategory('');
    setTitle('');
    setDescription('');
    setStepsToReproduce('');
    setSubmittedDraft(false);
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="report-target-url" className="form-label">
          URL de la página afectada
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="report-target-url"
          name="targetUrl"
          type="url"
          className="form-control"
          placeholder="https://ejemplo.com/suscripcion"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />
        <span className="form-hint">
          Introduce la dirección completa (http o https) donde aparece el
          comportamiento.
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="report-category" className="form-label">
          Categoría de Dark Pattern
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </label>
        <select
          id="report-category"
          name="category"
          className="form-control"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Selecciona una categoría...</option>
          {DARK_PATTERN_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="report-title" className="form-label">
          Título breve del reporte
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="report-title"
          name="title"
          type="text"
          className="form-control"
          placeholder="Ej. Botón de cancelar suscripción oculto tras cuatro pantallas"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="report-description" className="form-label">
          Descripción del patrón detectado
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id="report-description"
          name="description"
          className="form-control"
          rows={4}
          placeholder="Explica qué ocurre en la interfaz y cómo induce a error o dificulta la elección del usuario."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="report-steps" className="form-label">
          Pasos para reproducirlo
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id="report-steps"
          name="stepsToReproduce"
          className="form-control"
          rows={4}
          placeholder={
            '1. Entrar en la sección de cuenta.\n2. Pulsar en gestionar plan.\n3. Observar que no existe opción directa de baja.'
          }
          value={stepsToReproduce}
          onChange={(e) => setStepsToReproduce(e.target.value)}
        />
      </div>

      <div className="actions-row">
        <button type="submit" className="btn-primary">
          Enviar reporte
        </button>
        <button type="button" className="btn-secondary" onClick={handleReset}>
          Limpiar formulario
        </button>
      </div>

      {submittedDraft && (
        <p className="preview-notice" role="status">
          Vista previa de interfaz lista. En las siguientes tareas se activará
          la validación de campos y el envío al servidor.
        </p>
      )}
    </form>
  );
}
