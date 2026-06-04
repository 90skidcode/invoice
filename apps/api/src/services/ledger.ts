import { eq, and, sql } from 'drizzle-orm';
import type { DbClient } from '@counter/db';
import { stock_ledger } from '@counter/db';

type Trx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * Current stock for (org, item, location), derived authoritatively from the
 * append-only ledger as SUM(qty_in) - SUM(qty_out) (§1.2). Self-healing: a stale
 * denormalized balance_qty never propagates forward. Returns "0" if no movement.
 */
export async function getStockBalance(
  trx: Trx,
  orgId: string,
  itemId: string,
  locationId: string,
): Promise<string> {
  const [agg] = await trx
    .select({
      balance: sql<string>`coalesce(sum(${stock_ledger.qty_in}) - sum(${stock_ledger.qty_out}), 0)`,
    })
    .from(stock_ledger)
    .where(
      and(
        eq(stock_ledger.org_id, orgId),
        eq(stock_ledger.item_id, itemId),
        eq(stock_ledger.location_id, locationId),
      ),
    );
  return agg?.balance ?? '0';
}
