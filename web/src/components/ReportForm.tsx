'use client';

import { useState, type FormEvent } from 'react';
import {
  validateReportField,
  validateReportForm,
  type ReportCategory,
  type ReportFieldName,
  type ReportFormInput,
  type ReportValidationErrors,
} from '../lib/reports/validation';

interface CategoryOption {
  readonly value: ReportCategory;
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

const INITIAL_VALUES: ReportFormInput = {
  targetUrl: '',
  category: '',
  title: '',
  description: '',
  stepsToReproduce: '',
};

const FIELD_ELEMENT_IDS: Record<ReportFieldName, string> = {
  targetUrl: 'report-target-url',
  category: 'report-category',
  title: 'report-title',
  description: 'report-description',
  stepsToReproduce: 'report-steps',
};

export function ReportForm() {
  const [values, setValues] = useState<ReportFormInput>(INITIAL_VALUES);
  const [errors, setErrors] = useState<ReportValidationErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<ReportFieldName, boolean>>
  >({});
  const [hasSubmitAttempt, setHasSubmitAttempt] = useState(false);
  const [validatedSuccess, setValidatedSuccess] = useState(false);

  function handleFieldChange(field: ReportFieldName, nextValue: string) {
    setValues((prev) => ({ ...prev, [field]: nextValue }));
    setValidatedSuccess(false);

    if (touched[field] || hasSubmitAttempt) {
      const errorMessage = validateReportField(field, nextValue);
      setErrors((prev) => {
        const updated = { ...prev };
        if (errorMessage) {
          updated[field] = errorMessage;
        } else {
          delete updated[field];
        }
        return updated;
      });
    }
  }

  function handleFieldBlur(field: ReportFieldName) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errorMessage = validateReportField(field, values[field]);
    setErrors((prev) => {
      const updated = { ...prev };
      if (errorMessage) {
        updated[field] = errorMessage;
      } else {
        delete updated[field];
      }
      return updated;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitAttempt(true);

    const result = validateReportForm(values);
    setErrors(result.errors);

    if (!result.valid) {
      setValidatedSuccess(false);
      const firstInvalidField = (
        Object.keys(FIELD_ELEMENT_IDS) as ReportFieldName[]
      ).find((field) => Boolean(result.errors[field]));
      if (firstInvalidField) {
        document.getElementById(FIELD_ELEMENT_IDS[firstInvalidField])?.focus();
      }
      return;
    }

    setValidatedSuccess(true);
  }

  function handleReset() {
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({});
    setHasSubmitAttempt(false);
    setValidatedSuccess(false);
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      {hasSubmitAttempt && errorCount > 0 && (
        <div className="error-summary" role="alert">
          Revisa los campos marcados ({errorCount}{' '}
          {errorCount === 1 ? 'error pendiente' : 'errores pendientes'}) antes
          de enviar el reporte.
        </div>
      )}

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
          required
          aria-required="true"
          aria-invalid={Boolean(errors.targetUrl)}
          aria-describedby={errors.targetUrl ? 'error-target-url' : undefined}
          className={`form-control ${errors.targetUrl ? 'form-control-error' : ''}`}
          placeholder="https://ejemplo.com/suscripcion"
          value={values.targetUrl}
          onChange={(e) => handleFieldChange('targetUrl', e.target.value)}
          onBlur={() => handleFieldBlur('targetUrl')}
        />
        <span className="form-hint">
          Introduce la dirección completa (http o https) donde aparece el
          comportamiento.
        </span>
        {errors.targetUrl && (
          <span id="error-target-url" className="field-error" role="alert">
            {errors.targetUrl}
          </span>
        )}
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
          required
          aria-required="true"
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? 'error-category' : undefined}
          className={`form-control ${errors.category ? 'form-control-error' : ''}`}
          value={values.category}
          onChange={(e) => handleFieldChange('category', e.target.value)}
          onBlur={() => handleFieldBlur('category')}
        >
          <option value="">Selecciona una categoría...</option>
          {DARK_PATTERN_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {errors.category && (
          <span id="error-category" className="field-error" role="alert">
            {errors.category}
          </span>
        )}
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
          required
          aria-required="true"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'error-title' : undefined}
          className={`form-control ${errors.title ? 'form-control-error' : ''}`}
          placeholder="Ej. Botón de cancelar suscripción oculto tras cuatro pantallas"
          value={values.title}
          onChange={(e) => handleFieldChange('title', e.target.value)}
          onBlur={() => handleFieldBlur('title')}
        />
        {errors.title && (
          <span id="error-title" className="field-error" role="alert">
            {errors.title}
          </span>
        )}
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
          required
          aria-required="true"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? 'error-description' : undefined
          }
          className={`form-control ${errors.description ? 'form-control-error' : ''}`}
          rows={4}
          placeholder="Explica qué ocurre en la interfaz y cómo induce a error o dificulta la elección del usuario."
          value={values.description}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          onBlur={() => handleFieldBlur('description')}
        />
        {errors.description && (
          <span id="error-description" className="field-error" role="alert">
            {errors.description}
          </span>
        )}
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
          required
          aria-required="true"
          aria-invalid={Boolean(errors.stepsToReproduce)}
          aria-describedby={errors.stepsToReproduce ? 'error-steps' : undefined}
          className={`form-control ${errors.stepsToReproduce ? 'form-control-error' : ''}`}
          rows={4}
          placeholder={
            '1. Entrar en la sección de cuenta.\n2. Pulsar en gestionar plan.\n3. Observar que no existe opción directa de baja.'
          }
          value={values.stepsToReproduce}
          onChange={(e) =>
            handleFieldChange('stepsToReproduce', e.target.value)
          }
          onBlur={() => handleFieldBlur('stepsToReproduce')}
        />
        {errors.stepsToReproduce && (
          <span id="error-steps" className="field-error" role="alert">
            {errors.stepsToReproduce}
          </span>
        )}
      </div>

      <div className="actions-row">
        <button type="submit" className="btn-primary">
          Enviar reporte
        </button>
        <button type="button" className="btn-secondary" onClick={handleReset}>
          Limpiar formulario
        </button>
      </div>

      {validatedSuccess && (
        <p className="success-notice" role="status">
          Todos los campos obligatorios son válidos. En la siguiente tarea se
          conectará el envío con el endpoint del servidor.
        </p>
      )}
    </form>
  );
}
