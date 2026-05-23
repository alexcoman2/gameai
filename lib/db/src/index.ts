import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// IMPORTANT: This module is imported by the bundled API server that ships
// inside the Electron desktop app. On a user's Windows machine the bundle
// runs in PROXY mode and forwards every DB-touching route to the hosted
// server, so DATABASE_URL is legitimately absent. We MUST NOT throw at
// module-load time — that would crash the local server before it can boot
// and the Electron window would never appear.
//
// Both `pool` and `db` are exposed as proxies that materialize the real
// connection lazily on first method/property access. Hosted callers that
// actually issue a query will see a clear error if DATABASE_URL is missing;
// proxy callers that never touch the DB will never trigger it.

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): pg.Pool {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set to perform a database query. " +
        "If you are running the local Electron proxy server, no DB route " +
        "should ever execute here — this likely indicates a route that " +
        "forgot to short-circuit on IS_PROXY.",
    );
  }
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

function makeLazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop, receiver) {
      const target = resolve();
      const value = Reflect.get(target as object, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_t, prop) {
      return Reflect.has(resolve() as object, prop);
    },
    ownKeys() {
      return Reflect.ownKeys(resolve() as object);
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Reflect.getOwnPropertyDescriptor(resolve() as object, prop);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve() as object);
    },
  });
}

export const pool: pg.Pool = makeLazyProxy(getPool);
export const db: NodePgDatabase<typeof schema> = makeLazyProxy(getDb);

export * from "./schema";
