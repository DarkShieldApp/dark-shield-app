'use client';

import { useState, type FormEvent } from 'react';
import { REPORT_CATEGORY_OPTIONS } from '../lib/reports/categories';
import {
  validateReportField,
  validateReportForm,
  type ReportFieldName,
  type ReportFormInput,
  type ReportValidationErrors,
} from '../lib/reports/validation';

interface ApiReportResponse {
  report?: {
    id: string;
    title: string;
  };
  error?: {
    code: string;
    message: string;
    details?: ReportValidationErrors;
  };
}

const DARK_PATTERN_CATEGORIES = REPORT_CATEGORY_OPTIONS;

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);

  function handleFieldChange(field: ReportFieldName, nextValue: string) {
    setValues((prev) => ({ ...prev, [field]: nextValue }));
    setServerError(null);
    setCreatedReportId(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitAttempt(true);
    setServerError(null);
    setCreatedReportId(null);

    const result = validateReportForm(values);
    setErrors(result.errors);

    if (!result.valid) {
      const firstInvalidField = (
        Object.keys(FIELD_ELEMENT_IDS) as ReportFieldName[]
      ).find((field) => Boolean(result.errors[field]));
      if (firstInvalidField) {
        document.getElementById(FIELD_ELEMENT_IDS[firstInvalidField])?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const payload = (await response.json()) as ApiReportResponse;

      if (!response.ok) {
        if (payload.error?.details) {
          setErrors(payload.error.details);
        }
        setServerError(
          payload.error?.message ??
            'No se pudo registrar el reporte en el servidor.',
        );
        return;
      }

      setCreatedReportId(payload.report?.id ?? 'registrado');
      setValues(INITIAL_VALUES);
      setErrors({});
      setTouched({});
      setHasSubmitAttempt(false);
    } catch {
      setServerError(
        'Error de conexión con el servidor al intentar enviar el reporte.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({});
    setHasSubmitAttempt(false);
    setServerError(null);
    setCreatedReportId(null);
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

      {serverError && (
        <div className="error-summary" role="alert">
          {serverError}
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
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Enviando reporte...' : 'Enviar reporte'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleReset}
          disabled={isSubmitting}
        >
          Limpiar formulario
        </button>
      </div>

      {createdReportId && (
        <p className="success-notice" role="status">
          Reporte enviado y registrado correctamente (ID: {createdReportId}).
        </p>
      )}
    </form>
  );
}
