import { describe, expect, it } from 'vitest';
import {
  validateReportField,
  validateReportForm,
  validateTargetUrl,
  type ReportFormInput,
} from '../src/lib/reports/validation';

const VALID_INPUT: ReportFormInput = {
  targetUrl: 'https://shop.example.com/pricing',
  category: 'roach_motel',
  title: 'Cancelación oculta en múltiples pasos',
  description:
    'Para darse de baja obliga a llamar por teléfono en un horario restringido.',
  stepsToReproduce:
    '1. Acceder a mi cuenta.\n2. Entrar en suscripciones.\n3. Intentar cancelar.',
};

describe('validateTargetUrl', () => {
  it('rechaza valores vacíos o solo espacios', () => {
    expect(validateTargetUrl('')).toBeDefined();
    expect(validateTargetUrl('   ')).toBeDefined();
  });

  it('rechaza URLs mal formadas, protocolos no HTTP, dominios sin punto o con credenciales', () => {
    expect(validateTargetUrl('no-es-una-url')).toBeDefined();
    expect(validateTargetUrl('ftp://ejemplo.com/archivo')).toBeDefined();
    expect(validateTargetUrl('https://localhost')).toBeDefined();
    expect(validateTargetUrl('https://user:pass@ejemplo.com')).toBeDefined();
  });

  it('acepta URLs válidas http y https', () => {
    expect(
      validateTargetUrl('https://ejemplo.com/suscripcion'),
    ).toBeUndefined();
    expect(validateTargetUrl('http://sub.ejemplo.es')).toBeUndefined();
  });
});

describe('validateReportField y validateReportForm', () => {
  it('valida correctamente un formulario completo y válido', () => {
    const result = validateReportForm(VALID_INPUT);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('detecta todos los campos obligatorios vacíos', () => {
    const result = validateReportForm({
      targetUrl: '',
      category: '',
      title: '   ',
      description: '',
      stepsToReproduce: '',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.targetUrl).toBeDefined();
    expect(result.errors.category).toBeDefined();
    expect(result.errors.title).toBeDefined();
    expect(result.errors.description).toBeDefined();
    expect(result.errors.stepsToReproduce).toBeDefined();
  });

  it('rechaza categorías no permitidas y textos fuera de rango de longitud', () => {
    expect(validateReportField('category', 'inventada')).toBeDefined();
    expect(validateReportField('title', 'abc')).toBeDefined();
    expect(validateReportField('title', 'a'.repeat(121))).toBeDefined();
    expect(validateReportField('description', 'corta')).toBeDefined();
    expect(validateReportField('description', 'a'.repeat(2001))).toBeDefined();
    expect(validateReportField('stepsToReproduce', '1. Ir')).toBeDefined();
    expect(
      validateReportField('stepsToReproduce', 'a'.repeat(2001)),
    ).toBeDefined();
  });
});
