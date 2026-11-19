import { describe, expect, it } from 'vitest';
import { prepareReportDraft, type ReportDraft } from '../src/lib/reports/rules';

const validDraft: ReportDraft = {
  pageUrl: 'https://tienda.example/producto',
  pattern: 'Costes ocultos',
  description:
    'El importe final incluye un cargo que no se mostraba al principio.',
};

describe('preparación de reportes HU-05', () => {
  it('prepara los campos válidos sin modificar su contenido', () => {
    expect(prepareReportDraft(validDraft)).toEqual({
      ok: true,
      report: validDraft,
    });
  });

  it('recorta espacios exteriores', () => {
    expect(
      prepareReportDraft({
        ...validDraft,
        pageUrl: ' https://tienda.example ',
        pattern: ' Costes ocultos ',
        description: ` ${validDraft.description} `,
      }),
    ).toEqual({
      ok: true,
      report: {
        ...validDraft,
        pageUrl: 'https://tienda.example',
        pattern: 'Costes ocultos',
        description: validDraft.description,
      },
    });
  });

  it.each(['', '   ', 'not a url', 'ftp://tienda.example'])(
    'rechaza URL no web: %s',
    (pageUrl) =>
      expect(prepareReportDraft({ ...validDraft, pageUrl }).ok).toBe(false),
  );

  it('rechaza campos obligatorios vacíos', () => {
    const result = prepareReportDraft({
      ...validDraft,
      pattern: ' ',
      description: '',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        pattern: 'Selecciona o escribe el patrón observado.',
        description: 'Describe lo observado con al menos 20 caracteres.',
      },
    });
  });

  it('aplica los límites de longitud de la descripción', () => {
    expect(
      prepareReportDraft({ ...validDraft, description: 'corto' }),
    ).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
    expect(
      prepareReportDraft({ ...validDraft, description: 'x'.repeat(2001) }),
    ).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
    expect(
      prepareReportDraft({ ...validDraft, description: 'x'.repeat(20) }).ok,
    ).toBe(true);
  });

  it('limita el resultado a los campos del borrador', () => {
    const result = prepareReportDraft(validDraft);
    expect(result.ok && Object.keys(result.report).sort()).toEqual([
      'description',
      'pageUrl',
      'pattern',
    ]);
  });
});
