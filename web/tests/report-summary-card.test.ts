import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportSummaryCard } from '../src/components/ReportSummaryCard';
import type {
  ReportCredibilitySummary,
  ReportSummaryItem,
} from '../src/lib/reports/query';

const report: ReportSummaryItem = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  title: 'Costes sorpresa',
  description: 'Aparece un cargo al final del proceso de pago.',
  pattern_type: 'hidden_costs',
  target_url: 'https://tienda.example/checkout',
  page_key: 'https://tienda.example/checkout',
  created_at: '2026-11-19T10:00:00.000Z',
};

const credibility: ReportCredibilitySummary = {
  score: 67,
  level: 'medium',
  sufficientData: false,
  updatedAt: '2026-11-19T10:00:00.000Z',
  factors: {
    visibleEvidences: 2,
    validations: 3,
    invalidations: 1,
    assessors: 4,
    supportWeight: 0.75,
    againstWeight: 0.25,
  },
};

function render(overrides: Partial<ReportSummaryItem> = {}) {
  return renderToStaticMarkup(
    createElement(ReportSummaryCard, {
      report: { ...report, ...overrides },
    }),
  );
}

describe('HU-09/T3 — explicación de factores en la tarjeta', () => {
  it('explica los recuentos y pesos sin revelar datos personales', () => {
    const html = render({ credibility });

    expect(html).toContain('Datos insuficientes');
    expect(html).toContain('Cómo se calcula');
    expect(html).toContain('Evidencias visibles');
    expect(html).toContain('Validaciones');
    expect(html).toContain('Invalidaciones');
    expect(html).toContain('Personas valoradoras');
    expect(html).toContain('Peso a favor');
    expect(html).toContain('Peso en contra');
    expect(html).toContain('0,75');
    expect(html).toContain('0,25');
    expect(html).toContain('no cuenta la del autor del reporte');
    expect(html).not.toContain('trust_level');
  });

  it('informa cuando el resumen existe pero no trae desglose', () => {
    const withoutFactors: ReportCredibilitySummary = {
      ...credibility,
      factors: undefined,
    };
    const html = render({ credibility: withoutFactors });

    expect(html).toContain('Credibilidad');
    expect(html).toContain('El desglose de factores no está disponible');
  });

  it('no inventa credibilidad ni muestra factores si el cálculo no está disponible', () => {
    const html = render({ credibility: null });

    expect(html).toContain('Credibilidad no disponible');
    expect(html).not.toContain('Cómo se calcula');
    expect(html).not.toContain('La credibilidad cambia con nuevas evidencias');
  });

  it('conserva el nivel de título solicitado por el listado', () => {
    const html = renderToStaticMarkup(
      createElement(ReportSummaryCard, {
        report: { ...report, credibility },
        headingLevel: 'h4',
      }),
    );

    expect(html).toContain('<h4');
    expect(html).toContain('Cómo se calcula');
  });
});
