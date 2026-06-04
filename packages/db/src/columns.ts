import { timestamp } from 'drizzle-orm/pg-core';

/**
 * All timestamps in Counter are TIMESTAMPTZ (§5.6). Drizzle exposes this via
 * `timestamp(name, { withTimezone: true })`; this helper keeps the call sites terse.
 */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}
