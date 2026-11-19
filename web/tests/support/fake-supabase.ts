import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Doble del cliente de Supabase para las pruebas de los servicios del servidor
 * (evidencias y credibilidad). Reproduce solo las llamadas que hacen,
 * registra lo que recibe y devuelve resultados configurables; la RLS real y
 * las funciones SQL se prueban con pgTAP.
 */
export interface FakeError {
  message: string;
  code?: string;
  status?: number;
  statusCode?: string;
}

export interface FakeSupabaseConfig {
  user?: { id: string } | null;
  authError?: boolean;
  profile?: { id: string; is_active: boolean } | null;
  profileError?: boolean;
  report?: { id: string } | null;
  reportError?: boolean;
  ownCount?: number;
  countError?: boolean;
  insertError?: FakeError;
  listRows?: Record<string, unknown>[];
  listError?: boolean;
  objects?: Map<string, Blob>;
  signedUploadError?: boolean;
  downloadError?: FakeError;
  uploadError?: boolean;
  removeError?: boolean;
  signedUrlsError?: boolean;
  /** Datos que devuelve `rpc` (HU-09/T2). */
  rpcData?: unknown;
  rpcError?: FakeError;
  /** Si se define, `rpc` rechaza la promesa con este valor. */
  rpcThrows?: unknown;
}

export interface FakeSupabaseCalls {
  getUserTokens: string[];
  filters: { table: string; column: string; value: unknown }[];
  orFilters: string[];
  limits: number[];
  inserted: Record<string, unknown>[];
  signedUploads: string[];
  downloads: string[];
  uploads: {
    path: string;
    bytes: Uint8Array;
    contentType?: string;
    upsert?: boolean;
  }[];
  removed: string[][];
  signedUrls: { paths: string[]; expiresIn: number }[];
  buckets: string[];
  rpc: { name: string; args?: Record<string, unknown> }[];
}

type QueryResult = { data: unknown; error: unknown; count?: number | null };

class FakeQuery implements PromiseLike<QueryResult> {
  private mode: 'select' | 'count' | 'insert' = 'select';
  private row: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly config: FakeSupabaseConfig,
    private readonly calls: FakeSupabaseCalls,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.mode !== 'insert' && options?.head) this.mode = 'count';
    return this;
  }

  insert(row: Record<string, unknown>) {
    this.mode = 'insert';
    this.row = row;
    this.calls.inserted.push(row);
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.filters.push({ table: this.table, column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.calls.limits.push(count);
    return this;
  }

  or(filter: string) {
    this.calls.orFilters.push(filter);
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.single_());
  }

  single() {
    return Promise.resolve(this.single_());
  }

  then<T1 = QueryResult, T2 = never>(
    onfulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.many()).then(onfulfilled, onrejected);
  }

  private single_(): QueryResult {
    const failure = { message: 'fallo simulado de la base de datos' };
    if (this.table === 'profiles') {
      return this.config.profileError
        ? { data: null, error: failure }
        : { data: this.config.profile ?? null, error: null };
    }
    if (this.table === 'reports') {
      return this.config.reportError
        ? { data: null, error: failure }
        : { data: this.config.report ?? null, error: null };
    }
    if (this.mode === 'insert') {
      if (this.config.insertError) {
        return { data: null, error: this.config.insertError };
      }
      return {
        data: {
          ...this.row,
          moderation_status: 'visible',
          created_at: '2026-11-19T10:00:00.000Z',
        },
        error: null,
      };
    }
    throw new Error(`Consulta no prevista sobre ${this.table}`);
  }

  private many(): QueryResult {
    if (this.mode === 'count') {
      return this.config.countError
        ? { data: null, error: { message: 'fallo' }, count: null }
        : { data: null, error: null, count: this.config.ownCount ?? 0 };
    }
    return this.config.listError
      ? { data: null, error: { message: 'fallo' } }
      : { data: this.config.listRows ?? [], error: null };
  }
}

export function createFakeSupabase(config: FakeSupabaseConfig = {}) {
  const calls: FakeSupabaseCalls = {
    getUserTokens: [],
    filters: [],
    orFilters: [],
    limits: [],
    inserted: [],
    signedUploads: [],
    downloads: [],
    uploads: [],
    removed: [],
    signedUrls: [],
    buckets: [],
    rpc: [],
  };
  const objects = config.objects ?? new Map<string, Blob>();

  const bucket = {
    async createSignedUploadUrl(path: string) {
      calls.signedUploads.push(path);
      if (config.signedUploadError) {
        return { data: null, error: { message: 'fallo de Storage' } };
      }
      return {
        data: {
          path,
          token: `token-${path}`,
          signedUrl: `http://storage.test/upload/sign/${path}?token=token-${path}`,
        },
        error: null,
      };
    },
    async download(path: string) {
      calls.downloads.push(path);
      if (config.downloadError)
        return { data: null, error: config.downloadError };
      const blob = objects.get(path);
      return blob
        ? { data: blob, error: null }
        : {
            data: null,
            error: {
              message: 'Object not found',
              status: 400,
              statusCode: '404',
            },
          };
    },
    async upload(
      path: string,
      body: Uint8Array,
      options?: { contentType?: string; upsert?: boolean },
    ) {
      calls.uploads.push({
        path,
        bytes: body,
        contentType: options?.contentType,
        upsert: options?.upsert,
      });
      if (config.uploadError)
        return { data: null, error: { message: 'fallo' } };
      objects.set(
        path,
        new Blob([new Uint8Array(body)], { type: options?.contentType }),
      );
      return { data: { path }, error: null };
    },
    async remove(paths: string[]) {
      calls.removed.push(paths);
      if (config.removeError)
        return { data: null, error: { message: 'fallo' } };
      paths.forEach((path) => objects.delete(path));
      return { data: [], error: null };
    },
    async createSignedUrls(paths: string[], expiresIn: number) {
      calls.signedUrls.push({ paths, expiresIn });
      if (config.signedUrlsError)
        return { data: null, error: { message: 'fallo' } };
      return {
        data: paths.map((path) => ({
          path,
          signedUrl: `http://storage.test/sign/${path}?expires=${expiresIn}`,
          error: null,
        })),
        error: null,
      };
    },
  };

  const client = {
    auth: {
      async getUser(token: string) {
        calls.getUserTokens.push(token);
        if (config.authError || !config.user) {
          return {
            data: { user: null },
            error: config.authError ? { message: 'invalid JWT' } : null,
          };
        }
        return { data: { user: config.user }, error: null };
      },
    },
    from(table: string) {
      return new FakeQuery(table, config, calls);
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.rpc.push({ name, args });
      if (config.rpcThrows !== undefined) throw config.rpcThrows;
      if (config.rpcError) return { data: null, error: config.rpcError };
      return { data: config.rpcData ?? null, error: null };
    },
    storage: {
      from(name: string) {
        calls.buckets.push(name);
        return bucket;
      },
    },
  };

  return { client: client as unknown as SupabaseClient, calls, objects };
}
