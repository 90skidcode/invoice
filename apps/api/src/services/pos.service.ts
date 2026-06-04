import { eq, and, isNull, desc } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import {
  invoice_series,
  branches,
  locations,
  payment_modes,
  organizations,
} from '@counter/db';
import type { RequestContext } from '../context.js';
import { BusinessError } from '../errors.js';

/**
 * Everything the POS screen needs to start billing: default series, branch,
 * location, the org's state code (for intra/inter-state tax), and payment modes.
 */
export async function getPosBootstrap(db: DbClient, ctx: RequestContext) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, state_code: organizations.state_code })
    .from(organizations)
    .where(eq(organizations.id, ctx.org_id));

  const seriesRows = await db
    .select({
      id: invoice_series.id,
      name: invoice_series.name,
      is_default: invoice_series.is_default,
    })
    .from(invoice_series)
    .where(
      and(
        eq(invoice_series.org_id, ctx.org_id),
        eq(invoice_series.document_type, 'invoice'),
        eq(invoice_series.is_active, true),
      ),
    )
    .orderBy(desc(invoice_series.is_default));

  const branchRows = await db
    .select({ id: branches.id, name: branches.name, is_default: branches.is_default })
    .from(branches)
    .where(and(eq(branches.org_id, ctx.org_id), isNull(branches.deleted_at)))
    .orderBy(desc(branches.is_default));

  const locationRows = await db
    .select({ id: locations.id, name: locations.name, is_default: locations.is_default })
    .from(locations)
    .where(and(eq(locations.org_id, ctx.org_id), isNull(locations.deleted_at)))
    .orderBy(desc(locations.is_default));

  const modeRows = await db
    .select({ id: payment_modes.id, name: payment_modes.name, type: payment_modes.type })
    .from(payment_modes)
    .where(and(eq(payment_modes.org_id, ctx.org_id), eq(payment_modes.is_enabled, true)))
    .orderBy(payment_modes.display_order);

  if (!seriesRows[0]) throw new BusinessError('No active invoice series configured');
  if (!branchRows[0]) throw new BusinessError('No branch configured');
  if (!locationRows[0]) throw new BusinessError('No stock location configured');

  return {
    org: { id: org?.id, name: org?.name, state_code: org?.state_code },
    default_series_id: seriesRows[0].id,
    default_branch_id: branchRows[0].id,
    default_location_id: locationRows[0].id,
    series: seriesRows,
    branches: branchRows,
    locations: locationRows,
    payment_modes: modeRows,
  };
}
