# Counter: Comprehensive Offline-First Implementation Plan

## Executive Summary

Counter must work fully offline to serve shopkeepers and mechanics in areas with unreliable internet. This plan implements **local-first, multi-device sync** across all modules, prioritized by business impact.

**Total Effort**: ~16-20 weeks (4-5 person-months) for complete implementation
**Timeline**: 
- Phase 0 (Foundation): 2-3 weeks
- Phase 1 (POS/Invoices): 3-4 weeks
- Phase 2 (Master Data): 2-3 weeks
- Phase 3 (Inventory): 2-3 weeks
- Phase 4 (Purchases & Manufacturing): 2-3 weeks
- Phase 5 (Resilience & Polish): 2-3 weeks

**ROI**: Phase 1 alone (POS invoicing offline) will unlock the entire rural market segment and handle 80% of slow-network issues.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0: Foundation & Infrastructure](#2-phase-0-foundation--infrastructure)
3. [Phase 1: Core Transactions (POS & Sales Invoices)](#3-phase-1-core-transactions-pos--sales-invoices)
4. [Phase 2: Master Data Sync](#4-phase-2-master-data-sync)
5. [Phase 3: Inventory Management](#5-phase-3-inventory-management)
6. [Phase 4: Purchases & Manufacturing](#6-phase-4-purchases--manufacturing)
7. [Phase 5: Resilience & Polish](#7-phase-5-resilience--polish)
8. [Conflict Resolution Strategy](#8-conflict-resolution-strategy)
9. [Testing & Validation](#9-testing--validation)
10. [Deployment & Migration](#10-deployment--migration)
11. [Rollout Checklist](#11-rollout-checklist)

---

## 1. Architecture Overview

### 1.1 High-Level Data Flow

```
User Action (Offline)
    ↓
Write to Local SQLite (sync_status=0)
    ↓
Queue to Local Sync Outbox
    ↓
Update UI Immediately (optimistic)
    ↓
[Network Available?]
    ├─ YES → Sync Cycle
    │    ├─ POST /v1/sync/apply (batched writes)
    │    ├─ GET /v1/sync/changes (pull remote changes)
    │    └─ Merge (conflict resolution → local state)
    │         └─ Update local sync_status=1
    │
    └─ NO → Queue grows, user continues working
             (data is safe in local SQLite)
```

### 1.2 Tech Stack for Offline

| Layer | Current | Needed | Why |
|-------|---------|--------|-----|
| **Frontend** | React | + better-sqlite3 (Node bridge) or sql.js (pure JS) | Local persistence |
| **Local DB** | Browser storage | SQLite (synced schema) | Reliable, ACID, query-able |
| **Sync Protocol** | None | Custom REST + WebSocket | Conflict-free merges |
| **Client State** | TanStack Query | + local SQLite queries | Offline reads |
| **Conflict Resolution** | None | Last-write-wins + server-authoritative | Deterministic merges |

### 1.3 Data Partitioning: What Syncs

| Category | Sync Direction | Conflict? | Strategy |
|----------|-----------------|-----------|----------|
| **Transactional** (invoices, payments, purchases, stock moves) | Client→Server→All Clients | YES | Server-authoritative, diff-based |
| **Master Data** (items, customers, vendors, BOMs) | Bidirectional | UNLIKELY | Last-write-wins, client can edit offline |
| **Settings** (tax rates, users, permissions) | Server→Clients | NO | Read-only push on boot |
| **Reports** (audit log, stock ledger) | Server→Clients | NO | Read-only append-only logs |

### 1.4 Multi-Device Coordination

Every write is tagged with `device_id` (established at login):

```ts
// Device A saves invoice offline
await localDb.insert(invoices).values({
  id: uuidv7(),
  device_id: ctx.device_id,
  sync_status: 0,  // pending sync
  ...
});

// When syncing (Network returns)
POST /v1/sync/apply {
  device_id: "dev-a",
  changes: [{
    entity: 'invoices',
    entity_id: '...',
    op: 'create',
    payload: {...},
    timestamp: 1722345600000
  }]
}

// Server responds with server state + conflicts
{
  status: 'ok' | 'conflict',
  processed: [...],
  conflicts: [{ entity_id, reason, server_value, your_value }]
}
```

---

## 2. Phase 0: Foundation & Infrastructure

**Duration**: 2-3 weeks  
**Deliverable**: Offline architecture foundation; no end-user features yet  
**Go/No-Go Gate**: Sync engine working, test data syncing correctly

### 2.1 Packages to Create

#### 2.1.1 `packages/sync` - Sync Engine
**Files**:
- `src/protocol.ts` - Sync message types (TypeScript + Zod)
- `src/client.ts` - Client-side sync manager (queue, retry, merge logic)
- `src/server.ts` - Server-side sync processor (conflict resolution)
- `src/conflict-resolver.ts` - Merge strategies per entity type
- `src/queue.ts` - Outbox queue management

**Key Exports**:
```ts
export class SyncClient {
  // Local: queue writes for sync
  queueChange(entity, op, payload): Promise<void>
  
  // Network: push changes to server
  syncPush(): Promise<SyncResponse>
  
  // Network: pull remote changes
  syncPull(): Promise<RemoteChanges>
  
  // Local: merge remote changes
  applyRemoteChanges(changes): Promise<void>
}

export class SyncServer {
  // Process client changes, detect conflicts
  processChanges(orgId, deviceId, changes): Promise<ProcessResult>
}

export type ConflictResolver = (
  local: Entity,
  remote: Entity,
  server: Entity
) => Entity | 'reject';
```

#### 2.1.2 `packages/local-db` - Local SQLite Schema & Queries
**Files**:
- `src/schema.ts` - SQLite schema (mirrors server but simplified)
- `src/db.ts` - Connection pool, migrations
- `src/queries/` - Pre-compiled prepared statements per module
- `src/migrations/` - Migration system (similar to server, but lightweight)

**Why separate from `packages/db`**:
- `packages/db` = PostgreSQL (Drizzle ORM) for server
- `packages/local-db` = SQLite (better-sqlite3 or sql.js) for client
- Schemas are similar but not identical (e.g., no foreign keys in SQLite for performance)

#### 2.1.3 Update `packages/schemas` - Add Sync Types
```ts
// Sync request/response types
export const SyncChangeSchema = z.object({
  entity: z.enum(['invoices', 'customers', 'items', ...]),
  entity_id: z.string().uuid(),
  op: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.unknown()),
  timestamp: z.number(), // device clock milliseconds
  device_id: z.string(),
});

export const SyncConflictSchema = z.object({
  entity_id: z.string().uuid(),
  reason: z.enum(['edit_conflict', 'state_machine', 'referential']),
  server_value: z.record(z.unknown()),
  your_value: z.record(z.unknown()),
});
```

### 2.2 API Routes (Backend)

#### 2.2.1 POST `/v1/sync/apply`
**Purpose**: Client pushes locally-created changes to server  
**Auth**: Bearer token + `X-Device-Id` header  
**Request**:
```ts
{
  device_id: string,
  changes: Array<{
    entity: string,
    entity_id: string,
    op: 'create' | 'update' | 'delete',
    payload: object,
    timestamp: number  // device clock, for causality
  }>
}
```

**Response**:
```ts
{
  ok: true,
  processed: [entity_id, ...],  // which changes succeeded
  conflicts: Array<{
    entity_id: string,
    reason: string,
    server_value: object,
    your_value: object,
    resolution: 'reject' | 'merge'  // what to do
  }>,
  device_sync_token: string,  // opaque token for next pull
  server_seq: number  // sequence for causality
}
```

**Logic**:
1. Validate JWT, extract `org_id`, `user_id`
2. For each change:
   a. Apply change to a shadow copy of local state
   b. Check for conflicts with server state
   c. If conflict → add to conflicts array
   d. If no conflict → commit to DB, write audit log, emit WebSocket event
3. Return response with server state for conflicts

**Pseudo-code**:
```ts
async function syncApply(req: FastifyRequest, reply: FastifyReply) {
  const { device_id, changes } = SyncApplyInputSchema.parse(req.body);
  const { org_id, user_id } = req.ctx;
  
  const processed = [];
  const conflicts = [];
  
  return await db.transaction(async (trx) => {
    for (const change of changes) {
      try {
        const conflict = await detectConflict(trx, org_id, change);
        if (conflict) {
          conflicts.push({ entity_id: change.entity_id, ...conflict });
          continue;
        }
        
        // Apply the change
        await applyChange(trx, org_id, user_id, device_id, change);
        processed.push(change.entity_id);
        
        // Emit WebSocket to other devices
        broadcastChange(org_id, device_id, change);
        
      } catch (err) {
        // Database constraint violation
        conflicts.push({
          entity_id: change.entity_id,
          reason: 'database_constraint',
          error: err.message
        });
      }
    }
    
    return { ok: true, processed, conflicts, device_sync_token: generateToken() };
  });
}
```

#### 2.2.2 GET `/v1/sync/changes`
**Purpose**: Client pulls changes since last sync  
**Auth**: Bearer token + `X-Device-Id` header  
**Query Parameters**:
- `since_seq`: Last known server sequence (0 = first time)
- `since_timestamp`: Device timestamp from last sync (for fallback)

**Response**:
```ts
{
  ok: true,
  changes: Array<{
    entity: string,
    entity_id: string,
    op: 'create' | 'update' | 'delete',
    payload: object,
    device_id: string,  // which device made this change
    server_seq: number,
    timestamp: number
  }>,
  server_seq: number,  // sequence for next call
  device_seq: number  // your device's latest seq on server
}
```

**Logic**:
1. Query `sync_outbox` WHERE `org_id = $1 AND id > since_seq`
2. Also query `audit_log` for entities modified by other users/devices
3. Return latest 1000 changes (paginate if needed)
4. Include `server_seq` so client knows what to ask for next time

**Pseudo-code**:
```ts
async function syncChanges(req: FastifyRequest) {
  const { since_seq = 0 } = req.query;
  const { org_id, device_id } = req.ctx;
  
  const changes = await db.select()
    .from(sync_outbox)
    .where(and(
      eq(sync_outbox.org_id, org_id),
      gt(sync_outbox.id, since_seq)
    ))
    .limit(1000)
    .orderBy(asc(sync_outbox.id));
  
  const maxSeq = changes.length ? changes[changes.length - 1].id : since_seq;
  
  return {
    ok: true,
    changes: changes.map(c => ({
      entity: c.entity,
      entity_id: c.entity_id,
      op: c.op,
      payload: JSON.parse(c.payload),
      server_seq: c.id,
      timestamp: c.created_at.getTime(),
      device_id: c.device_id
    })),
    server_seq: maxSeq
  };
}
```

#### 2.2.3 WebSocket Event: `/v1/ws/sync`
**Purpose**: Real-time sync push (alternative to polling)  
**Message Types**:
```ts
// Server → Client
{ type: 'change', entity, entity_id, op, payload, server_seq }
{ type: 'ping', timestamp }
{ type: 'sync_ack', processed: [entity_id, ...] }

// Client → Server
{ type: 'pong', timestamp }
{ type: 'sync_ready' }  // I'm ready to receive changes
```

**Implementation**:
- Use `ws` library (already approved)
- Keep 1 WebSocket per device (close on logout)
- Broadcast changes from one device to all others in same org
- Heartbeat every 30s to detect stale connections

### 2.3 Client-Side Infrastructure (React)

#### 2.3.1 Hook: `useSyncStatus()`
```ts
export function useSyncStatus() {
  const [status, setStatus] = useState<'online' | 'syncing' | 'offline'>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = syncStore.subscribe((state) => {
      setStatus(state.status);
      setPendingCount(state.outbox.length);
      setLastSyncedAt(state.lastSyncedAt);
      setSyncError(state.lastError?.message ?? null);
    });
    return unsubscribe;
  }, []);
  
  return { status, pendingCount, lastSyncedAt, syncError };
}
```

#### 2.3.2 Zustand Store: `syncStore`
```ts
interface SyncState {
  status: 'online' | 'syncing' | 'offline' | 'error';
  outbox: SyncChange[];
  lastSyncedAt: Date | null;
  serverSeq: number;
  deviceSyncToken: string;
  lastError: Error | null;
  
  // Actions
  queueChange(entity, op, payload): void;
  syncPush(): Promise<void>;
  syncPull(): Promise<void>;
  applyRemoteChanges(changes): Promise<void>;
  retry(): void;
}

export const syncStore = create<SyncState>((set, get) => ({
  // ...
  queueChange: (entity, op, payload) => {
    const change: SyncChange = {
      entity,
      op,
      payload,
      entity_id: payload.id,
      timestamp: Date.now(),
      device_id: getDeviceId(),
      status: 'pending'
    };
    set((state) => ({
      outbox: [...state.outbox, change]
    }));
  },
  
  syncPush: async () => {
    const { outbox } = get();
    if (!outbox.length) return;
    
    set({ status: 'syncing' });
    try {
      const response = await api.post('/v1/sync/apply', {
        device_id: getDeviceId(),
        changes: outbox
      });
      
      // Update local DB with processed IDs
      for (const id of response.processed) {
        await localDb.update(sync_outbox)
          .set({ status: 'processed', processed_at: new Date() })
          .where(eq(sync_outbox.entity_id, id));
      }
      
      // Handle conflicts
      if (response.conflicts.length) {
        handleConflicts(response.conflicts);
      }
      
      set({
        status: 'online',
        lastSyncedAt: new Date(),
        serverSeq: response.server_seq,
        outbox: outbox.filter(c => !response.processed.includes(c.entity_id))
      });
      
    } catch (err) {
      set({ status: 'error', lastError: err });
    }
  }
}));
```

#### 2.3.3 Background Sync Task
```ts
// In main.tsx or App.tsx
export function setupBackgroundSync() {
  // Retry sync every 30s if online and pending
  setInterval(async () => {
    if (navigator.onLine && syncStore.getState().outbox.length > 0) {
      await syncStore.getState().syncPush();
    }
  }, 30_000);
  
  // Pull changes every 60s if online
  setInterval(async () => {
    if (navigator.onLine) {
      await syncStore.getState().syncPull();
    }
  }, 60_000);
  
  // Listen to online/offline events
  window.addEventListener('online', async () => {
    syncStore.setState({ status: 'online' });
    await syncStore.getState().syncPush();
  });
  
  window.addEventListener('offline', () => {
    syncStore.setState({ status: 'offline' });
  });
}
```

### 2.4 Local SQLite Database Setup

#### 2.4.1 Local Schema (simplified from server)

```ts
// packages/local-db/src/schema.ts
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const local_sync_outbox = sqliteTable('sync_outbox', {
  entity_id: text('entity_id').primaryKey(),
  entity: text('entity').notNull(),
  op: text('op').notNull(),
  payload: text('payload').notNull(), // JSON stringified
  status: text('status').default('pending'),
  timestamp: integer('timestamp').notNull(),
  device_id: text('device_id').notNull(),
  created_at: integer('created_at').notNull(),
});

export const local_invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull(),
  branch_id: text('branch_id').notNull(),
  series_id: text('series_id').notNull(),
  invoice_no: text('invoice_no'),  // nullable initially (assigned on sync)
  invoice_date: integer('invoice_date').notNull(),  // timestamp
  customer_id: text('customer_id'),
  customer_name_snapshot: text('customer_name_snapshot'),
  // ... all invoice fields ...
  sync_status: integer('sync_status').default(0),  // 0=pending, 1=synced
  device_id: text('device_id').notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export const local_invoice_lines = sqliteTable('invoice_lines', {
  id: text('id').primaryKey(),
  invoice_id: text('invoice_id').notNull(),
  line_no: integer('line_no').notNull(),
  item_id: text('item_id').notNull(),
  qty: real('qty').notNull(),
  rate: text('rate').notNull(),  // stored as string (decimal)
  // ... all line fields ...
});

// ... similarly for: customers, items, vendors, stock_ledger, etc.
```

#### 2.4.2 Local DB Initialization

```ts
// packages/local-db/src/db.ts
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export async function initializeLocalDb(dbPath: string) {
  // Create DB file if doesn't exist
  const sqlite = new BetterSqlite3(dbPath);
  
  // Enable foreign keys (for referential integrity)
  sqlite.pragma('foreign_keys = ON');
  
  // Run migrations (create tables)
  await runMigrations(sqlite);
  
  // Return Drizzle instance
  return drizzle(sqlite);
}

async function runMigrations(sqlite: Database) {
  const migrationDir = path.join(__dirname, 'migrations');
  const migrations = fs
    .readdirSync(migrationDir)
    .sort();
  
  for (const file of migrations) {
    const migration = await import(path.join(migrationDir, file));
    await migration.up(sqlite);
  }
}
```

#### 2.4.3 Migration Example

```ts
// packages/local-db/src/migrations/001_initial.ts
export async function up(sqlite: Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      series_id TEXT NOT NULL,
      invoice_no TEXT,
      invoice_date INTEGER NOT NULL,
      customer_id TEXT,
      customer_name_snapshot TEXT,
      subtotal TEXT NOT NULL,
      tax_total TEXT NOT NULL,
      grand_total TEXT NOT NULL,
      sync_status INTEGER DEFAULT 0,
      device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      INDEX idx_org_id (org_id),
      INDEX idx_device_id (device_id),
      INDEX idx_sync_status (sync_status)
    );
    
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      qty REAL NOT NULL,
      rate TEXT NOT NULL,
      subtotal TEXT NOT NULL,
      tax_amount TEXT NOT NULL,
      total TEXT NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      INDEX idx_invoice_id (invoice_id)
    );
    
    -- ... more tables ...
  `);
}
```

### 2.5 Testing Infrastructure

#### 2.5.1 Sync Client Tests
- `packages/sync/sync-client.test.ts`
  - ✅ Queue a change locally
  - ✅ Sync push with no conflicts
  - ✅ Sync push with conflicts
  - ✅ Retry on network failure (exponential backoff)
  - ✅ Handle concurrent changes from 2 devices

#### 2.5.2 Sync Server Tests
- `apps/api/src/routes/sync.test.ts`
  - ✅ Process valid sync request
  - ✅ Detect edit conflicts
  - ✅ Detect state machine conflicts (e.g., void then pay)
  - ✅ Reject invalid operations (period locked, insufficient stock)
  - ✅ Broadcast changes to other devices via WebSocket
  - ✅ Handle duplicate submissions (idempotency)

#### 2.5.3 E2E Tests
- `tests/e2e/offline-sync.spec.ts`
  - ✅ Create invoice offline, sync when online
  - ✅ Both devices create invoices offline, sync, no conflict
  - ✅ Both devices edit same customer, server-authoritative merge
  - ✅ Simulate network drop/recovery
  - ✅ Verify `sync_outbox` table populated
  - ✅ Verify `audit_log` created for all synced changes

### 2.6 Deliverables for Phase 0

- [ ] `packages/sync` created with SyncClient, SyncServer, ConflictResolver
- [ ] `packages/local-db` created with SQLite schema
- [ ] `packages/schemas` updated with sync types
- [ ] Backend sync routes: `POST /v1/sync/apply`, `GET /v1/sync/changes`, `POST /v1/ws/sync`
- [ ] Frontend: `useSyncStatus()` hook, `syncStore` (Zustand)
- [ ] Background sync task set up
- [ ] All Phase 0 tests passing
- [ ] Integration test: offline save → sync → verify in audit log

**Success Criteria**:
- ✅ Can save an invoice to local SQLite offline
- ✅ Can sync to server without conflicts
- ✅ Server creates audit log entry
- ✅ Can detect & handle a simple conflict

---

## 3. Phase 1: Core Transactions (POS & Sales Invoices)

**Duration**: 3-4 weeks  
**Deliverable**: Full offline-capable POS; invoicing works without internet  
**Go/No-Go Gate**: POS screen saves, syncs, prints correctly offline  
**Business Impact**: **HIGHEST** — This is the biggest pain point for field sales

### 3.1 Modules in Phase 1

- **POS Module** (highest priority)
  - Offline checkout
  - Local invoice number reservation
  - Print thermal receipt from local data
  
- **Invoices Module** (critical path for POS)
  - Full CRUD offline
  - Stock ledger entries written offline
  - Invoice numbering conflict resolution

- **Customers Module** (supporting)
  - Master data sync on boot
  - Allow create/edit offline (will rebase on sync)

- **Items Module** (supporting)
  - Master data sync on boot
  - Search/lookup works offline

### 3.2 POS Flow (Offline First)

```
User opens POS screen (offline)
    ↓
[Load from Local Cache]
    ├─ Customers (synced on login)
    ├─ Items (synced on login)
    ├─ Tax Rates (synced on login)
    └─ Stock Balances (pulled via sync)
    ↓
[Add items to cart]
    → Search items locally (fuse.js)
    → Get qty from local stock_ledger
    → Compute line tax (offline)
    ↓
[Save Invoice]
    ├─ Reserve invoice number locally (from client-reserved range)
    ├─ Write to local_invoices
    ├─ Write to local_invoice_lines
    ├─ Write stock_ledger entries (qty_out)
    ├─ Queue sync_outbox entries
    └─ UI shows "Saved ✓" immediately
    ↓
[Print Receipt]
    → Render from local invoice data
    → Use thermal printer (or PDF preview)
    ↓
[Sync When Online]
    → Push changes via POST /v1/sync/apply
    → Handle invoice number conflicts (renumber)
    → Pull remote changes
    → Merge inventory (stock_ledger is append-only, so no conflict)
```

### 3.3 Implementation Details

#### 3.3.1 Invoice Number Reservation (Client-Side)

**On Login**, client reserves a range of invoice numbers:

```ts
// Backend: POST /v1/invoices/reserve-range
export async function reserveInvoiceNumberRange(req, reply) {
  const { org_id, device_id } = req.ctx;
  const { series_id, qty = 50 } = req.body;
  
  return await db.transaction(async (trx) => {
    // Lock and increment
    const series = await trx.select()
      .from(invoice_series)
      .where(eq(invoice_series.id, series_id))
      .for(sql`UPDATE`);
    
    if (!series[0]) throw new NotFoundError('Series not found');
    
    const startNo = series[0].next_number;
    const endNo = startNo + qty;
    
    await trx.update(invoice_series)
      .set({ next_number: endNo })
      .where(eq(invoice_series.id, series_id));
    
    return {
      series_id,
      device_id,
      start_number: startNo,
      end_number: endNo,
      reserved_at: new Date()
    };
  });
}

// Frontend: usePOS hook
export function usePOS() {
  const [reserved, setReserved] = useState<NumberRange | null>(null);
  const [nextLocal, setNextLocal] = useState(1);
  
  useEffect(() => {
    // On mount, reserve 50 numbers
    const reserve = async () => {
      const range = await api.post('/v1/invoices/reserve-range', {
        series_id: ctx.series_id,
        qty: 50
      });
      setReserved(range);
      setNextLocal(range.start_number);
    };
    reserve();
  }, []);
  
  // Generate invoice number locally (no network needed)
  const getNextInvoiceNumber = () => {
    if (!reserved || nextLocal >= reserved.end_number) {
      // Would need to reserve more; for now, show warning
      console.warn('Invoice number range exhausted, connect to internet to reserve more');
      return null;
    }
    const no = nextLocal;
    setNextLocal(no + 1);
    return no;
  };
  
  return { getNextInvoiceNumber, reserved };
}
```

**On Sync**, if numbers conflict:

```ts
// Server side: POST /v1/sync/apply
// Device A offline: invoices #10-12
// Device B online: invoices #8-9
// On sync, A's #10-12 renumbered to #13-15 if B took #10-12

function detectInvoiceNumberConflict(
  devAInvoice,
  devBInvoices,
  reserved
): ConflictResolution {
  if (devBInvoices.some(inv => inv.invoice_no === devAInvoice.invoice_no)) {
    // Number collision: renumber device A's invoice
    const nextAvailable = Math.max(...devBInvoices.map(i => i.invoice_no)) + 1;
    return {
      entity_id: devAInvoice.id,
      resolution: 'renumber',
      old_number: devAInvoice.invoice_no,
      new_number: nextAvailable
    };
  }
  return { resolution: 'accept' };
}
```

#### 3.3.2 Stock Ledger Entries (Append-Only)

When invoice is saved (online or offline), create stock ledger entries immediately:

```ts
// Frontend: POS save
async function savePOSInvoice(invoice) {
  return await localDb.transaction(async (trx) => {
    // 1. Save invoice header
    await trx.insert(local_invoices).values({
      id: uuidv7(),
      invoice_no: getNextInvoiceNumber(),
      invoice_date: new Date(),
      customer_id: invoice.customer_id,
      grand_total: invoice.grand_total,
      sync_status: 0,  // pending sync
      device_id: getDeviceId()
    });
    
    // 2. Save invoice lines
    for (const line of invoice.lines) {
      await trx.insert(local_invoice_lines).values({
        invoice_id: invoice.id,
        item_id: line.item_id,
        qty: line.qty,
        rate: line.rate,
        // ...
      });
    }
    
    // 3. Write stock ledger entries (qty_out per location)
    for (const line of invoice.lines) {
      const balance = await getRunningBalance(trx, line.item_id, line.location_id);
      
      await trx.insert(local_stock_ledger).values({
        item_id: line.item_id,
        location_id: line.location_id,
        qty_in: 0,
        qty_out: line.qty,
        balance_qty: balance - line.qty,  // running balance
        txn_type: 'sales_out',
        txn_date: invoice.invoice_date,
        ref_table: 'invoices',
        ref_id: invoice.id,
        device_id: getDeviceId()
      });
    }
    
    // 4. Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'invoices',
      entity_id: invoice.id,
      op: 'create',
      payload: JSON.stringify(invoice),
      status: 'pending'
    });
  });
}
```

#### 3.3.3 Stock Balance Query (Works Offline)

```ts
// Frontend: Get current stock for display
async function getStockBalance(
  itemId: string,
  locationId: string
): Promise<Decimal> {
  // Query local stock_ledger for running balance
  const ledger = await localDb.select()
    .from(local_stock_ledger)
    .where(and(
      eq(local_stock_ledger.item_id, itemId),
      eq(local_stock_ledger.location_id, locationId)
    ))
    .orderBy(desc(local_stock_ledger.created_at))
    .limit(1);
  
  return new Decimal(ledger[0]?.balance_qty ?? 0);
}

// Used in POS
const availableQty = await getStockBalance(selectedItem.id, ctx.location_id);
if (requestedQty > availableQty && !allowNegative) {
  showError(`Only ${availableQty} available`);
  return;
}
```

#### 3.3.4 Print Receipt (Offline Capable)

```ts
// Frontend: POS print button
async function printReceipt(invoiceId: string) {
  // Load from local DB (no network needed)
  const invoice = await localDb.query.invoices
    .findFirst({ where: eq(local_invoices.id, invoiceId) });
  
  const lines = await localDb.query.invoice_lines
    .findMany({ where: eq(local_invoice_lines.invoice_id, invoiceId) });
  
  // Render HTML
  const html = renderInvoiceHTML({
    invoice,
    lines,
    org: ctx.org,
    sync_status: invoice.sync_status === 0 ? '(Pending Sync)' : ''
  });
  
  // Print via window.print() or thermal printer API
  if (ctx.device.hasThermalPrinter) {
    await thermalPrinter.print(html);
  } else {
    window.open('data:text/html,' + encodeURIComponent(html), '_blank');
  }
}
```

#### 3.3.5 Customer Lookup (Offline)

```ts
// Frontend: Customer picker in POS
export function useCustomerSearch() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // On mount, sync customers from server
  useEffect(() => {
    syncCustomersToLocal();
  }, []);
  
  const search = (query: string) => {
    if (!query) return [];
    
    // Search local database
    const results = fuse.search(query, {
      keys: ['name', 'phone', 'customer_code']
    }).map(r => r.item);
    
    return results;
  };
  
  const syncCustomersToLocal = async () => {
    try {
      // Pull from server (with timeout)
      const fromServer = await Promise.race([
        api.get('/v1/customers?limit=10000'),
        sleep(5000).then(() => [])  // fallback to local if slow
      ]);
      
      // Save to local
      await localDb.insert(local_customers).values(fromServer);
      
    } catch (err) {
      // Offline or network error; use only local
      const local = await localDb.query.customers.findMany();
      setCustomers(local);
    }
  };
  
  return { search };
}
```

### 3.4 Conflict Resolution: Invoices

**Scenario 1: Number Collision**
- Device A saves invoice #100 offline
- Device B (online) creates invoice #100
- A's sync detected as conflict
- **Resolution**: Server renumbers A's invoice to #101

**Scenario 2: Partial Payment After Void**
- Device A voids invoice #100
- Device B adds payment to invoice #100
- On sync, A's void is processed first
- B's payment fails (invoice is voided)
- **Resolution**: Reject B's payment, send conflict to B

**Scenario 3: Stock Ledger (No Conflict Possible)**
- Device A sells item X (qty out = 5)
- Device B sells item X (qty out = 3)
- Both write to stock_ledger (append-only)
- Running balance: 0 → -5 (from A) → -8 (from B, or -3 → -3 depending on order)
- **Resolution**: Server processes all ledger entries in timestamp order, recomputes running balance for all

### 3.5 Testing Phase 1

#### 3.5.1 Offline Scenarios
```ts
// tests/e2e/pos-offline.spec.ts

test('POS: Save invoice offline, no internet', async ({ browser }) => {
  // 1. Load POS in browser
  // 2. Turn off network (offline mode)
  // 3. Add items to cart
  // 4. Save invoice
  // 5. Verify saved to local DB
  // 6. Verify sync_outbox has entry
  // 7. Turn network back on
  // 8. Verify sync pushed automatically
  // 9. Verify invoice in server DB
});

test('POS: Print receipt while offline', async ({ browser }) => {
  // 1. Save invoice offline
  // 2. Print receipt (should use local data)
  // 3. Verify PDF generated without network call
});

test('POS: Invoice number conflict resolution', async ({ browser1, browser2 }) => {
  // Device 1 and 2 both offline
  // Dev1 reserves #100-149, saves #100
  // Dev2 reserves #100-149, saves #100
  // Both sync
  // Verify Dev2's invoice renumbered to #150 (or next available)
  // Verify audit log shows old vs new number
});

test('POS: Concurrent sales, stock updates', async ({ browser1, browser2 }) => {
  // Stock: Item X has 100 units
  // Dev1 sells 60 units
  // Dev2 sells 50 units
  // Both offline
  // Both sync
  // Verify stock_ledger has both entries
  // Verify final balance = 100 - 60 - 50 = -10 (if allow_negative)
  // Verify each device sees updated balance on next sync pull
});
```

#### 3.5.2 Server-Side Tests
```ts
// apps/api/src/routes/sync.test.ts (extend existing)

test('Sync: Renumber invoice on number collision', async () => {
  // Simulate Device A pushing invoice #100 while #100 exists on server
  // Verify response includes renumber conflict
  // Verify database has new number
  // Verify audit log entry for renumber
});

test('Sync: Reject payment after void', async () => {
  // Push void of invoice
  // Then push payment to same invoice
  // Verify conflict returned
  // Verify payment not created
  // Verify audit log shows rejection reason
});
```

### 3.6 Deliverables for Phase 1

- [ ] Invoice number reservation endpoint
- [ ] Stock ledger queries work offline (no API call)
- [ ] POS screen saves invoice to local DB
- [ ] Sync detects & resolves invoice number conflicts
- [ ] Print receipt from local data (offline)
- [ ] Customer search works offline (uses synced data)
- [ ] Background sync pushes invoices and stock ledger entries
- [ ] All Phase 1 E2E tests passing
- [ ] No API calls required for basic POS checkout

**Success Criteria**:
- ✅ Save invoice completely offline
- ✅ Stock deducted locally
- ✅ Print receipt without network
- ✅ Sync when online, no data loss
- ✅ Number conflicts resolved automatically

---

## 4. Phase 2: Master Data Sync

**Duration**: 2-3 weeks  
**Deliverable**: Items, customers, vendors sync to all devices; editable offline  
**Blocking**: Some sales features (can't create new customer offline easily)  
**Go/No-Go Gate**: Items/Customers fully synced; all fields work offline

### 4.1 Modules in Phase 2

- **Items** (highest priority)
  - Sync all fields on login
  - Search works offline
  - Create/edit offline (rebased on sync)
  - Images cached locally

- **Customers** (high priority)
  - Full sync on login
  - Create/edit offline
  - Merge conflicts (last-write-wins)

- **Vendors** (medium priority)
  - Same as customers

- **Reference Data** (medium priority)
  - Tax rates (versioned, sync all versions)
  - Units, categories, brands (rarely change)
  - Locations, branches (sync on login)
  - Price tiers, payment modes (sync on login)
  - Invoice series (sync with next_number reservation)

### 4.2 Master Data Sync Strategy

Master data has **low conflict probability** (edits are rare, mostly reads). Strategy:

1. **On Login**: Sync all master data to local DB
2. **During Use**: Can edit offline (optimistic, queue for sync)
3. **On Sync**: Last-write-wins merge (server timestamp vs device timestamp)
4. **Broadcast**: When one user edits item, all other users get notified (WebSocket)

#### 4.2.1 Full Master Data Sync Endpoint

```ts
// Backend: GET /v1/sync/bootstrap
// Returns all master data for a device (org context from JWT)
export async function syncBootstrap(req, reply) {
  const { org_id, device_id } = req.ctx;
  const { since_timestamp = 0 } = req.query;
  
  return {
    ok: true,
    data: {
      items: await getItems(org_id, since_timestamp),
      customers: await getCustomers(org_id, since_timestamp),
      vendors: await getVendors(org_id, since_timestamp),
      tax_rates: await getTaxRates(org_id),  // all versions
      units: await getUnits(org_id),
      categories: await getCategories(org_id),
      brands: await getBrands(org_id),
      locations: await getLocations(org_id),
      branches: await getBranches(org_id),
      price_tiers: await getPriceTiers(org_id),
      invoice_series: await getInvoiceSeries(org_id),
      period_locks: await getPeriodLocks(org_id),
      timestamp: Date.now()
    }
  };
}

// Frontend: Call on login
async function bootstrapLocal(orgId) {
  try {
    // With timeout: if server slow, continue with local
    const bootstrap = await Promise.race([
      api.get('/v1/sync/bootstrap', { timeout: 10000 }),
      sleep(10000).then(() => null)  // fallback
    ]);
    
    if (bootstrap) {
      // Save all to local DB in transaction
      await localDb.transaction(async (trx) => {
        for (const item of bootstrap.data.items) {
          await trx.insert(local_items).values(item).onConflictDoUpdate({
            target: local_items.id,
            set: item
          });
        }
        // ... similarly for customers, vendors, etc.
      });
    }
    
  } catch (err) {
    console.warn('Bootstrap sync failed, using local cache', err);
    // Local cache exists from previous login
  }
}
```

#### 4.2.2 Item Sync (with Images)

Items include images, which can be large. Strategy:

```ts
// Backend: GET /v1/sync/items?since=timestamp
// Returns item data WITHOUT images (separate endpoint for images)
export async function syncItems(req, reply) {
  const { org_id } = req.ctx;
  const { since = 0 } = req.query;
  
  const items = await db.select()
    .from(items_table)
    .where(and(
      eq(items_table.org_id, org_id),
      gte(items_table.updated_at, new Date(since)),
      isNull(items_table.deleted_at)
    ));
  
  return {
    ok: true,
    items: items.map(item => ({
      ...item,
      image_urls: item.image_urls.map(url => url.split('/').pop())  // UUID only
    })),
    timestamp: Date.now()
  };
}

// Backend: GET /v1/items/:id/image/:uuid
// Existing endpoint; service worker caches these (cache-first strategy)

// Frontend: Sync item, then download images on demand
async function syncItemsAndImages() {
  // 1. Sync all item metadata
  const bootstrap = await api.get('/v1/sync/bootstrap');
  
  // 2. Save to local (without images)
  for (const item of bootstrap.data.items) {
    await localDb.insert(local_items).values(item);
  }
  
  // 3. Download images in background (lazy)
  for (const item of bootstrap.data.items) {
    for (const imageUuid of item.image_urls) {
      // Will be cached by service worker after first load
      await preloadImage(`/uploads/${imageUuid}`);
    }
  }
}
```

#### 4.2.3 Customer/Vendor Merge on Sync

When same customer edited on two devices:

```ts
// Device A (offline) updates customer: name = "John Doe" at 10:00
// Device B (offline) updates customer: phone = "9876543210" at 10:05
// On sync, merge both changes

function mergeCustomerUpdates(
  local: Customer,
  remote: Customer,
  server: Customer
): Customer {
  // Field-level last-write-wins merge
  const merged = { ...server };
  
  for (const field of Object.keys(local)) {
    const localTime = local.updated_at;
    const remoteTime = remote.updated_at;
    
    if (localTime > remoteTime) {
      merged[field] = local[field];  // local is newer
    } else if (remoteTime > localTime) {
      merged[field] = remote[field];  // remote is newer
    }
    // If same time, keep server (deterministic)
  }
  
  return merged;
}

// Conflict detection
if (
  local.updated_at !== server.updated_at &&
  remote.updated_at !== server.updated_at
) {
  // Both sides edited since server version → possible conflict
  const merged = mergeCustomerUpdates(local, remote, server);
  return { status: 'merged', value: merged };
} else {
  // No conflict, accept local changes
  return { status: 'accept', value: local };
}
```

### 4.3 Item Search Offline

Use `fuse.js` for client-side search:

```ts
// Frontend: POS item search
import Fuse from 'fuse.js';

export function useItemSearch() {
  const [items, setItems] = useState<Item[]>([]);
  const [fuse, setFuse] = useState<Fuse<Item> | null>(null);
  
  // On mount, load all items from local DB
  useEffect(() => {
    const loadItems = async () => {
      const allItems = await localDb.query.items.findMany({
        where: isNull(local_items.deleted_at)
      });
      setItems(allItems);
      
      // Create Fuse index (runs once)
      setFuse(new Fuse(allItems, {
        keys: ['name', 'sku', 'barcode'],
        threshold: 0.3,  // fuzzy matching
        includeScore: true
      }));
    };
    loadItems();
  }, []);
  
  const search = (query: string) => {
    if (!fuse || !query) return items;
    return fuse.search(query).map(r => r.item);
  };
  
  return { search, all: items };
}
```

**Barcode Scanning**: Use barcode table for instant lookup

```ts
// Frontend: Barcode scanner input
async function handleBarcodeScanned(barcode: string) {
  const item = await localDb.query.item_barcodes
    .findFirst({ where: eq(local_item_barcodes.barcode, barcode) })
    .then(bc => bc ? 
      localDb.query.items.findFirst({ where: eq(local_items.id, bc.item_id) })
      : null);
  
  if (item) {
    addToCart(item);
  } else {
    showError(`Item not found: ${barcode}`);
  }
}
```

### 4.4 Testing Phase 2

```ts
// tests/e2e/master-data-sync.spec.ts

test('Sync: Bootstrap on login', async ({ browser }) => {
  // 1. Fresh login
  // 2. Should call GET /v1/sync/bootstrap
  // 3. Verify all items, customers, vendors in local DB
  // 4. Verify items queryable
  // 5. Verify customers searchable
});

test('Sync: Item search works offline', async ({ browser }) => {
  // 1. Bootstrap, go offline
  // 2. Search for items
  // 3. Verify results returned (fuse.js)
  // 4. Verify barcode lookup works
});

test('Sync: Edit customer offline, merge on sync', async ({ browser1, browser2 }) => {
  // 1. Both devices have customer "John"
  // 2. Dev1 offline: change name to "John Doe"
  // 3. Dev2 offline: change phone to "9876543210"
  // 4. Both sync
  // 5. Verify final customer has both changes (merged)
  // 6. Verify audit log shows both edits
});

test('Sync: Edit same field conflict (last-write-wins)', async ({ browser1, browser2 }) => {
  // 1. Customer "John" (name field)
  // 2. Dev1 offline: name = "John Doe" at 10:00
  // 3. Dev2 offline: name = "Johnny" at 10:05
  // 4. Both sync
  // 5. Verify Dev2's version wins (newer timestamp)
  // 6. Verify Dev1 sees updated name on next pull
});

test('Sync: Delete customer offline, sync', async ({ browser }) => {
  // 1. Delete customer offline
  // 2. Set deleted_at locally
  // 3. Queue in sync_outbox (op='delete')
  // 4. Sync
  // 5. Verify soft-deleted on server
  // 6. Verify audit log has delete entry
});
```

### 4.5 Deliverables for Phase 2

- [ ] Bootstrap endpoint `/v1/sync/bootstrap` returns all master data
- [ ] Items fully synced on login (metadata + barcode data)
- [ ] Customers/vendors fully synced
- [ ] Item search works offline (fuse.js)
- [ ] Barcode scanner works offline
- [ ] Merge logic for conflicting edits
- [ ] Image caching (lazy load)
- [ ] All Phase 2 E2E tests passing

**Success Criteria**:
- ✅ Login syncs all items/customers offline
- ✅ Can search items without network
- ✅ Can create customer offline, sync conflict-free
- ✅ Barcode scanner works offline

---

## 5. Phase 3: Inventory Management

**Duration**: 2-3 weeks  
**Deliverable**: Stock adjustments, transfers work offline; stock_ledger conflicts resolved  
**Blocking**: Inventory accuracy features  
**Go/No-Go Gate**: Stock adjustments sync correctly, running balance correct

### 5.1 Modules in Phase 3

- **Stock Adjustments** (highest priority)
  - Save adjustment offline
  - Write stock_ledger entries offline
  - Sync conflict-free (append-only ledger)

- **Stock Transfers** (high priority)
  - Save transfer (draft) offline
  - Receive transfer offline
  - Stock ledger entries for both locations

- **Stock Ledger** (supporting)
  - Running balance computed correctly offline
  - Append-only enforcement (local SQLite trigger)
  - Query for stock reports works offline

### 5.2 Stock Adjustment Offline

```ts
// Frontend: Stock adjustment form
async function saveAdjustment(adjustment) {
  return await localDb.transaction(async (trx) => {
    // 1. Save adjustment header
    const adjId = uuidv7();
    await trx.insert(local_stock_adjustments).values({
      id: adjId,
      adjustment_no: generateAdjustmentNo(),  // may change on sync
      adjustment_date: adjustment.adjustment_date,
      location_id: adjustment.location_id,
      reason: adjustment.reason,
      status: 'posted',  // immediately post (different from invoices)
      sync_status: 0,
      device_id: getDeviceId()
    });
    
    // 2. Save adjustment lines
    for (const line of adjustment.lines) {
      await trx.insert(local_stock_adjustment_lines).values({
        id: uuidv7(),
        adjustment_id: adjId,
        item_id: line.item_id,
        qty_change: line.qty_change,  // +5 for receipt, -3 for damage
        batch_id: line.batch_id,
        rate: line.rate,
        value: new Decimal(line.qty_change).times(line.rate).toString()
      });
    }
    
    // 3. Create stock_ledger entries immediately
    for (const line of adjustment.lines) {
      const balance = await getRunningBalance(trx, line.item_id, adjustment.location_id);
      
      await trx.insert(local_stock_ledger).values({
        item_id: line.item_id,
        location_id: adjustment.location_id,
        batch_id: line.batch_id,
        qty_in: line.qty_change > 0 ? line.qty_change : 0,
        qty_out: line.qty_change < 0 ? -line.qty_change : 0,
        balance_qty: balance + line.qty_change,
        txn_type: line.qty_change > 0 ? 'adjustment_in' : 'adjustment_out',
        txn_date: adjustment.adjustment_date,
        rate: line.rate,
        value: line.value,
        ref_table: 'stock_adjustments',
        ref_id: adjId,
        device_id: getDeviceId()
      });
    }
    
    // 4. Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'stock_adjustments',
      entity_id: adjId,
      op: 'create',
      payload: JSON.stringify({
        adjustment: adjustment,
        lines: adjustment.lines
      }),
      status: 'pending'
    });
    
    return adjId;
  });
}
```

### 5.3 Stock Ledger Conflicts (None!)

Because stock_ledger is **append-only**, there are NO conflicts:

```ts
// Device A & B both offline
// Dev A: adjustment +5 units at 10:00
// Dev B: adjustment +3 units at 10:05
// Both write to stock_ledger and sync

// Scenario 1: Process A first, then B
// Balance: 0 → +5 → +8 ✓

// Scenario 2: Process B first, then A
// Balance: 0 → +3 → +8 ✓

// Running balance must be recomputed after all entries arrive
// (server does this, or client after pulling all changes)

function recomputeRunningBalance(ledgerEntries: StockLedgerEntry[]) {
  let balance = 0;
  for (const entry of ledgerEntries.sort((a, b) => a.created_at - b.created_at)) {
    balance += (entry.qty_in - entry.qty_out);
    entry.balance_qty = balance;
  }
}
```

**Key Insight**: Stock ledger **never** has conflicts because order doesn't matter (addition is commutative). Server just recomputes running balance.

### 5.4 Stock Transfer (More Complex)

Stock transfers have 2 stages:

```
1. Create (Draft)
2. Receive (Posted)

Offline scenario:
- Device A: Create transfer draft at location-A
- Device B: Receive same transfer at location-B
- Both offline
- On sync: order matters!
  - Must CREATE first, then RECEIVE
  - If order wrong, receiver would fail (transfer not found)
```

**Solution**: Use timestamp causality

```ts
// Frontend: Stock transfer flow
async function createTransfer(transfer) {
  const transferId = uuidv7();
  
  await localDb.transaction(async (trx) => {
    // Stage 1: Create draft
    await trx.insert(local_stock_transfers).values({
      id: transferId,
      transfer_no: generateTransferNo(),
      transfer_date: new Date(),
      from_location_id: transfer.from_location_id,
      to_location_id: transfer.to_location_id,
      status: 'draft',  // NOT posted yet
      sync_status: 0,
      device_id: getDeviceId(),
      created_at: Date.now()
    });
    
    // Save lines
    for (const line of transfer.lines) {
      await trx.insert(local_stock_transfer_lines).values({
        transfer_id: transferId,
        item_id: line.item_id,
        qty: line.qty,
        batch_id: line.batch_id
      });
    }
    
    // Queue for sync (but DON'T create ledger yet)
    await trx.insert(local_sync_outbox).values({
      entity: 'stock_transfers',
      entity_id: transferId,
      op: 'create',
      payload: JSON.stringify(transfer),
      timestamp: Date.now(),  // IMPORTANT: for causality
      status: 'pending'
    });
  });
}

async function receiveTransfer(transferId, receivedQtys) {
  await localDb.transaction(async (trx) => {
    // Verify transfer exists and is in transit
    const transfer = await trx.query.stock_transfers
      .findFirst({ where: eq(local_stock_transfers.id, transferId) });
    
    if (!transfer) throw new Error('Transfer not found');
    
    // Update status
    await trx.update(local_stock_transfers)
      .set({ status: 'received', updated_at: new Date() })
      .where(eq(local_stock_transfers.id, transferId));
    
    // NOW create stock ledger entries
    for (const line of transfer.lines) {
      const receivedQty = receivedQtys[line.id] ?? line.qty;
      
      // Outbound from source
      const sourceBalance = await getRunningBalance(trx, line.item_id, transfer.from_location_id);
      await trx.insert(local_stock_ledger).values({
        item_id: line.item_id,
        location_id: transfer.from_location_id,
        qty_in: 0,
        qty_out: receivedQty,
        balance_qty: sourceBalance - receivedQty,
        txn_type: 'transfer_out',
        ref_table: 'stock_transfers',
        ref_id: transferId
      });
      
      // Inbound to destination
      const destBalance = await getRunningBalance(trx, line.item_id, transfer.to_location_id);
      await trx.insert(local_stock_ledger).values({
        item_id: line.item_id,
        location_id: transfer.to_location_id,
        qty_in: receivedQty,
        qty_out: 0,
        balance_qty: destBalance + receivedQty,
        txn_type: 'transfer_in',
        ref_table: 'stock_transfers',
        ref_id: transferId
      });
    }
    
    // Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'stock_transfers',
      entity_id: transferId,
      op: 'update',
      payload: JSON.stringify({ status: 'received', received_qtys: receivedQtys }),
      timestamp: Date.now(),
      status: 'pending'
    });
  });
}
```

**Server-Side Sync Logic**:

```ts
// When processing sync changes, enforce causality
function detectCausality(changes: SyncChange[]): boolean {
  // For each update to stock_transfers with status='received',
  // verify that create with same entity_id was processed first
  
  for (const change of changes) {
    if (change.entity === 'stock_transfers' && change.op === 'update') {
      const payload = JSON.parse(change.payload);
      if (payload.status === 'received') {
        // Verify create was processed
        const create = changes.find(c =>
          c.entity === 'stock_transfers' &&
          c.entity_id === change.entity_id &&
          c.op === 'create'
        );
        if (!create) {
          // Create is missing; this must be received elsewhere
          // Check if create already on server
          const existing = await db.query.stock_transfers
            .findFirst({ where: eq(stock_transfers.id, change.entity_id) });
          if (!existing) {
            return { status: 'conflict', reason: 'missing_create' };
          }
        }
      }
    }
  }
  return { status: 'ok' };
}
```

### 5.5 Testing Phase 3

```ts
// tests/e2e/inventory-sync.spec.ts

test('Inventory: Stock adjustment offline', async ({ browser }) => {
  // 1. Create adjustment offline
  // 2. Verify stock_ledger updated locally
  // 3. Verify running balance correct
  // 4. Go online and sync
  // 5. Verify on server
});

test('Inventory: Multiple adjustments, no conflicts', async ({ browser1, browser2 }) => {
  // 1. Start: Item X has 100 units
  // 2. Dev1 offline: +10 units
  // 3. Dev2 offline: -5 units
  // 4. Both sync
  // 5. Verify server has both ledger entries
  // 6. Verify running balance = 100 + 10 - 5 = 105
});

test('Inventory: Stock transfer (2-stage)', async ({ browser1, browser2 }) => {
  // 1. Dev1 offline: create transfer A→B
  // 2. Dev2 offline: receive transfer (NOT yet created from Dev1!)
  // 3. Dev1 sync first
  // 4. Dev2 sync second
  // 5. Verify order enforced (create before receive)
  // 6. Verify stock_ledger entries both created
});

test('Inventory: Stock report works offline', async ({ browser }) => {
  // 1. Sync inventory data offline
  // 2. Run stock report (no API call)
  // 3. Verify balances by item/location
});
```

### 5.6 Deliverables for Phase 3

- [ ] Stock adjustments save offline
- [ ] Stock ledger entries created immediately (offline)
- [ ] Running balance recomputed correctly
- [ ] Stock transfers (create + receive) work offline
- [ ] Causality enforced on sync (create before receive)
- [ ] Stock reports work offline (query local ledger)
- [ ] All Phase 3 E2E tests passing

**Success Criteria**:
- ✅ Adjustments sync conflict-free
- ✅ Stock balances accurate offline and online
- ✅ No orphaned transfers (receive without create)

---

## 6. Phase 4: Purchases & Manufacturing

**Duration**: 2-3 weeks  
**Deliverable**: Purchases, credit notes, BOMs all work offline  
**Blocking**: Full inventory control  
**Go/No-Go Gate**: Purchase invoices sync correctly

### 6.1 Modules in Phase 4

- **Purchase Invoices** (highest priority)
  - Same pattern as sales invoices
  - Reverse charge (RCM) computation offline
  - Stock inbound entries

- **Credit Notes** (high priority)
  - Link to original invoice (offline)
  - Optionally restore stock
  - Conflict resolution if original invoice voided

- **BOMs** (medium priority)
  - Sync BOM master data
  - Create/edit offline

- **Production Orders** (medium priority)
  - Save production run offline
  - Consume materials (stock_ledger entries)
  - Output finished goods

### 6.2 Purchase Invoice Sync

Very similar to sales invoices, with differences:

```ts
// Frontend: Save purchase invoice offline
async function savePurchaseInvoice(purchase) {
  return await localDb.transaction(async (trx) => {
    // 1. Save header
    const purchaseId = uuidv7();
    await trx.insert(local_purchase_invoices).values({
      id: purchaseId,
      voucher_no: generateVoucherNo(),  // will rename on sync if conflict
      voucher_date: purchase.voucher_date,
      vendor_id: purchase.vendor_id,
      vendor_invoice_no: purchase.vendor_invoice_no,
      receive_location_id: purchase.receive_location_id,
      is_intra_state: purchase.is_intra_state,
      reverse_charge: purchase.reverse_charge,
      grand_total: purchase.grand_total,
      sync_status: 0,
      device_id: getDeviceId()
    });
    
    // 2. Save lines
    for (const line of purchase.lines) {
      await trx.insert(local_purchase_invoice_lines).values({
        purchase_id: purchaseId,
        item_id: line.item_id,
        qty: line.qty,
        rate: line.rate,
        batch_no: line.batch_no,
        mfg_date: line.mfg_date,
        expiry_date: line.expiry_date
      });
    }
    
    // 3. Create stock_ledger entries (qty_in)
    for (const line of purchase.lines) {
      const balance = await getRunningBalance(
        trx,
        line.item_id,
        purchase.receive_location_id
      );
      
      await trx.insert(local_stock_ledger).values({
        item_id: line.item_id,
        location_id: purchase.receive_location_id,
        batch_id: line.batch_id,
        qty_in: line.qty,
        qty_out: 0,
        balance_qty: balance + line.qty,
        txn_type: 'purchase_in',
        ref_table: 'purchase_invoices',
        ref_id: purchaseId
      });
    }
    
    // 4. Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'purchase_invoices',
      entity_id: purchaseId,
      op: 'create',
      payload: JSON.stringify(purchase),
      status: 'pending'
    });
    
    return purchaseId;
  });
}
```

**Reverse Charge (RCM) Calculation**: Must know vendor GSTIN registration type at sync time

```ts
// Compute RCM offline
function computeRCM(purchase, vendor) {
  if (!purchase.reverse_charge) return Decimal.ZERO;
  
  // RCM applies when vendor is unregistered
  if (vendor.gst_reg_type !== 'Consumer') return Decimal.ZERO;
  
  // RCM = tax on taxable amount
  const taxableAmt = new Decimal(purchase.taxable_total);
  const taxRate = new Decimal('0.18');  // or lookup from tax_rates
  return taxableAmt.times(taxRate);
}
```

### 6.3 Credit Note Sync

Credit notes reference an original invoice (may be offline or on server):

```ts
// Frontend: Create credit note offline
async function saveCreditNote(creditNote) {
  return await localDb.transaction(async (trx) => {
    // 1. Verify original invoice exists (locally or assume it will on sync)
    const original = await trx.query.invoices
      .findFirst({ where: eq(local_invoices.id, creditNote.original_invoice_id) });
    
    if (!original) {
      console.warn('Original invoice not in local DB; will validate on sync');
    }
    
    // 2. Save credit note header
    const creditId = uuidv7();
    await trx.insert(local_credit_notes).values({
      id: creditId,
      credit_note_no: generateCreditNoteNo(),
      credit_note_date: creditNote.credit_note_date,
      original_invoice_id: creditNote.original_invoice_id,
      customer_id: creditNote.customer_id,
      reason: creditNote.reason,
      refund_mode: creditNote.refund_mode,
      grand_total: creditNote.grand_total,
      sync_status: 0,
      device_id: getDeviceId()
    });
    
    // 3. Save lines (with restore_stock flag)
    for (const line of creditNote.lines) {
      await trx.insert(local_credit_note_lines).values({
        credit_note_id: creditId,
        item_id: line.item_id,
        qty: line.qty,
        restore_stock: line.restore_stock
      });
    }
    
    // 4. Create stock_ledger entries (qty_in if restoring)
    for (const line of creditNote.lines) {
      if (line.restore_stock) {
        const balance = await getRunningBalance(trx, line.item_id, ctx.location_id);
        
        await trx.insert(local_stock_ledger).values({
          item_id: line.item_id,
          location_id: ctx.location_id,
          qty_in: line.qty,
          qty_out: 0,
          balance_qty: balance + line.qty,
          txn_type: 'return_in',
          ref_table: 'credit_notes',
          ref_id: creditId
        });
      }
    }
    
    // 5. Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'credit_notes',
      entity_id: creditId,
      op: 'create',
      payload: JSON.stringify(creditNote),
      status: 'pending'
    });
    
    return creditId;
  });
}

// Server sync: Validate credit note
function validateCreditNote(creditNote, serverInvoice): Conflict | null {
  if (!serverInvoice) {
    return {
      entity_id: creditNote.id,
      reason: 'original_invoice_not_found',
      message: `Invoice ${creditNote.original_invoice_id} not found`
    };
  }
  
  if (serverInvoice.voided_at) {
    return {
      entity_id: creditNote.id,
      reason: 'original_invoice_voided',
      message: 'Cannot credit a voided invoice'
    };
  }
  
  // Check qty being returned doesn't exceed original
  for (const line of creditNote.lines) {
    const origLine = serverInvoice.lines.find(l => l.id === line.original_line_id);
    if (!origLine) {
      return {
        entity_id: creditNote.id,
        reason: 'line_not_found',
        message: `Line not found in original invoice`
      };
    }
    
    if (line.qty > origLine.qty) {
      return {
        entity_id: creditNote.id,
        reason: 'qty_exceeds_original',
        message: `Returning ${line.qty} but original qty was ${origLine.qty}`
      };
    }
  }
  
  return null;  // valid
}
```

### 6.4 BOM & Production Orders

BOMs and production orders are tightly linked:

```ts
// Frontend: Save production order offline
async function saveProductionOrder(order) {
  return await localDb.transaction(async (trx) => {
    // 1. Fetch BOM to know materials & ratios
    const bom = await trx.query.bom_headers
      .findFirst({ where: eq(local_bom_headers.id, order.bom_id) });
    
    const orderId = uuidv7();
    
    // 2. Save production order
    await trx.insert(local_production_orders).values({
      id: orderId,
      voucher_no: generateVoucherNo(),
      production_date: order.production_date,
      bom_header_id: order.bom_id,
      finished_item_id: bom.finished_item_id,
      planned_qty: order.planned_qty,
      produced_qty: order.produced_qty,
      location_id: order.location_id,
      status: 'completed',
      sync_status: 0,
      device_id: getDeviceId()
    });
    
    // 3. Create stock_ledger entries for RM consumption
    for (const bomItem of bom.items) {
      const qtyConsumed = new Decimal(order.produced_qty)
        .times(bomItem.qty)
        .toDecimalPlaces(3);
      
      const balance = await getRunningBalance(
        trx,
        bomItem.raw_item_id,
        order.location_id
      );
      
      await trx.insert(local_stock_ledger).values({
        item_id: bomItem.raw_item_id,
        location_id: order.location_id,
        qty_in: 0,
        qty_out: parseFloat(qtyConsumed.toString()),
        balance_qty: balance - qtyConsumed,
        txn_type: 'production_out',
        ref_table: 'production_orders',
        ref_id: orderId
      });
    }
    
    // 4. Create stock_ledger entry for FG output
    const fgBalance = await getRunningBalance(
      trx,
      bom.finished_item_id,
      order.location_id
    );
    
    await trx.insert(local_stock_ledger).values({
      item_id: bom.finished_item_id,
      location_id: order.location_id,
      qty_in: order.produced_qty,
      qty_out: 0,
      balance_qty: fgBalance + order.produced_qty,
      txn_type: 'production_in',
      ref_table: 'production_orders',
      ref_id: orderId
    });
    
    // 5. Queue for sync
    await trx.insert(local_sync_outbox).values({
      entity: 'production_orders',
      entity_id: orderId,
      op: 'create',
      payload: JSON.stringify(order),
      status: 'pending'
    });
    
    return orderId;
  });
}
```

### 6.5 Testing Phase 4

```ts
// tests/e2e/purchases-and-manufacturing.spec.ts

test('Purchases: Save and sync', async ({ browser }) => {
  // Full purchase invoice flow offline → sync
});

test('Purchases: RCM calculation offline', async ({ browser }) => {
  // Verify RCM computed for unregistered vendors offline
});

test('CreditNotes: Link to original invoice', async ({ browser }) => {
  // Create credit note for invoice created offline
  // Verify relationship maintained on sync
});

test('CreditNotes: Conflict if original voided', async ({ browser1, browser2 }) => {
  // Dev1: void invoice offline
  // Dev2: create credit note for same invoice offline
  // Dev1 syncs first
  // Dev2 syncs second → conflict
  // Verify credit note rejected
});

test('Production: Consume RM, output FG', async ({ browser }) => {
  // Create production order offline
  // Verify RM qty_out and FG qty_in both created
  // Verify balances correct
});
```

### 6.6 Deliverables for Phase 4

- [ ] Purchase invoices sync offline (same as sales)
- [ ] RCM calculation works offline
- [ ] Credit notes with validation on sync
- [ ] BOMs synced (master data)
- [ ] Production orders sync offline
- [ ] Material consumption tracked (stock_ledger)
- [ ] All Phase 4 E2E tests passing

**Success Criteria**:
- ✅ Full purchase flow offline
- ✅ Credit notes validate on sync
- ✅ Production orders create correct stock moves

---

## 7. Phase 5: Resilience & Polish

**Duration**: 2-3 weeks  
**Deliverable**: Robust sync, offline UI, slow network handling  
**Blocking**: Production readiness  
**Go/No-Go Gate**: Works reliably on slow networks, handles disconnections gracefully

### 7.1 Modules in Phase 5

- **Resilience**
  - Retry logic with exponential backoff
  - Conflict UI (show user when conflict detected)
  - Deduplication (idempotency on sync)

- **Slow Network**
  - Streaming responses for large reports
  - Request timeouts (fail fast)
  - Pagination for lists (pull in batches)

- **UI/UX**
  - Sync status bar (top of app)
  - Offline indicator
  - "Pending Sync" badge on unsync'd documents
  - Manual retry button

- **Performance**
  - Index local SQLite for fast queries
  - Lazy-load heavy screens
  - Prune old sync_outbox entries

### 7.2 Retry & Backoff

```ts
// packages/sync/src/client.ts
export class SyncClient {
  private async syncPushWithRetry(
    maxRetries = 5,
    initialDelayMs = 1000
  ): Promise<void> {
    let delay = initialDelayMs;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.syncPush();
        return;  // success
      } catch (err) {
        if (attempt < maxRetries - 1) {
          const jitter = Math.random() * 0.1 * delay;
          const waitTime = delay + jitter;
          await sleep(waitTime);
          delay *= 2;  // exponential backoff
        } else {
          throw err;  // final attempt failed
        }
      }
    }
  }
}
```

### 7.3 Conflict UI

```tsx
// Frontend: Show unresolved conflicts to user
export function useConflictHandler() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  
  // When sync returns conflicts
  const handleConflict = (conflict: Conflict) => {
    const action = getResolutionForConflict(conflict);
    
    if (action === 'manual') {
      // Show dialog to user
      return new Promise<string>((resolve) => {
        showConflictDialog({
          entity: conflict.entity,
          local: conflict.your_value,
          remote: conflict.server_value,
          onResolve: (choice: 'local' | 'remote' | 'merged') => {
            resolve(choice);
          }
        });
      });
    } else if (action === 'reject') {
      // Silent reject (e.g., constraint violation)
      return Promise.resolve('reject');
    } else {
      // Auto-merge (e.g., last-write-wins)
      return Promise.resolve('merge');
    }
  };
}

// UI Component
export function ConflictDialog({ entity, local, remote, onResolve }) {
  return (
    <Dialog open={true}>
      <DialogTitle>Sync Conflict</DialogTitle>
      <DialogContent>
        <p>The {entity} has been changed on the server while you were offline.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-bold">Your Changes</h3>
            <pre className="bg-gray-100 p-2">{JSON.stringify(local, null, 2)}</pre>
          </div>
          <div>
            <h3 className="font-bold">Server Version</h3>
            <pre className="bg-gray-100 p-2">{JSON.stringify(remote, null, 2)}</pre>
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onResolve('local')}>Keep Mine</Button>
        <Button onClick={() => onResolve('remote')}>Use Server</Button>
        <Button onClick={() => onResolve('merged')}>Merge</Button>
      </DialogActions>
    </Dialog>
  );
}
```

### 7.4 Slow Network Handling

#### 7.4.1 Streaming Reports

```ts
// Backend: GET /v1/reports/gst-report
export async function gstReport(req, reply) {
  const { org_id } = req.ctx;
  const { date_from, date_to } = req.query;
  
  // Stream large reports
  reply.header('Content-Type', 'application/x-ndjson');
  
  const stream = db.select()
    .from(invoices)
    .where(and(
      eq(invoices.org_id, org_id),
      gte(invoices.invoice_date, new Date(date_from)),
      lte(invoices.invoice_date, new Date(date_to))
    ))
    .stream();  // Use cursor, not all-at-once
  
  for await (const invoice of stream) {
    reply.raw.write(JSON.stringify(invoice) + '\n');
  }
  
  reply.raw.end();
}

// Frontend: Consume stream
async function fetchGSTReport(dateFrom, dateTo) {
  const response = await fetch('/v1/reports/gst-report?date_from=...&date_to=...');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  const rows = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value);
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        rows.push(JSON.parse(line));
        // Process incrementally, not waiting for full response
      }
    }
  }
  
  return rows;
}
```

#### 7.4.2 Request Timeouts

```ts
// Frontend: Wrapper around fetch
function fetchWithTimeout(url, timeout = 10000) {
  return Promise.race([
    fetch(url),
    sleep(timeout).then(() => 
      Promise.reject(new Error(`Request timeout (${timeout}ms)`))
    )
  ]);
}

// Use in api-client.ts
async function fetchApi<T>(path: string, options = {}) {
  const timeout = options.timeout ?? 10000;
  
  try {
    const response = await Promise.race([
      fetch(`${BASE_URL}${path}`, options),
      sleep(timeout).then(() => 
        Promise.reject(new Error('timeout'))
      )
    ]);
    // ...
  } catch (err) {
    if (err.message === 'timeout') {
      // Fall back to local data if available
      syncStore.setState({ status: 'offline' });
      return loadFromLocal(path);
    }
    throw err;
  }
}
```

### 7.5 Sync Status UI

```tsx
// Frontend: Persistent status bar
export function SyncStatusBar() {
  const { status, pendingCount, lastSyncedAt, syncError } = useSyncStatus();
  
  const statusLabel = {
    'online': '✓ Synced',
    'syncing': '⟳ Syncing...',
    'offline': '⊘ Offline',
    'error': '⚠ Sync Failed'
  }[status];
  
  const statusColor = {
    'online': 'bg-green-100 text-green-800',
    'syncing': 'bg-yellow-100 text-yellow-800',
    'offline': 'bg-gray-100 text-gray-800',
    'error': 'bg-red-100 text-red-800'
  }[status];
  
  return (
    <div className={`px-4 py-2 text-sm ${statusColor} flex justify-between`}>
      <span>
        {statusLabel}
        {pendingCount > 0 && ` (${pendingCount} pending)`}
        {lastSyncedAt && ` • Last sync: ${formatTime(lastSyncedAt)}`}
      </span>
      {status === 'error' && (
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => syncStore.getState().retry()}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
```

### 7.6 Document "Pending" Badge

```tsx
// Frontend: Show on invoice list if not synced
export function InvoiceRow({ invoice }) {
  const isSynced = invoice.sync_status === 1;
  
  return (
    <TableRow>
      <TableCell>{invoice.invoice_no}</TableCell>
      <TableCell>{invoice.customer_name}</TableCell>
      <TableCell>₹{formatPrice(invoice.grand_total)}</TableCell>
      <TableCell>
        {!isSynced && (
          <Badge variant="outline" className="bg-yellow-50">
            Pending Sync
          </Badge>
        )}
      </TableCell>
      <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
    </TableRow>
  );
}
```

### 7.7 Performance Optimization

#### 7.7.1 SQLite Indexes

```ts
// packages/local-db/src/migrations/003_indexes.ts
export async function up(sqlite: Database) {
  sqlite.exec(`
    -- Fast lookups by org + date
    CREATE INDEX IF NOT EXISTS idx_invoices_org_date
      ON invoices(org_id, invoice_date DESC);
    
    -- Fast lookups by sync status
    CREATE INDEX IF NOT EXISTS idx_invoices_sync_status
      ON invoices(sync_status);
    
    -- Stock balance queries
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_location
      ON stock_ledger(item_id, location_id);
    
    -- Search by customer
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_id
      ON invoices(customer_id);
    
    -- Device ID for filtering
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_device_id
      ON sync_outbox(device_id, status);
  `);
}
```

#### 7.7.2 Prune Old Sync Outbox

```ts
// Backend: Periodic cleanup (BullMQ job)
jobQueue.define('prune-sync-outbox', async () => {
  // Delete entries older than 30 days AND synced
  await db.delete(sync_outbox)
    .where(and(
      eq(sync_outbox.status, 'processed'),
      lt(sync_outbox.processed_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    ));
});
```

### 7.8 Testing Phase 5

```ts
// tests/e2e/resilience.spec.ts

test('Resilience: Retry on network failure', async ({ browser }) => {
  // 1. Save invoice
  // 2. Simulate network failure
  // 3. Verify retry kicks in
  // 4. Verify exponential backoff
  // 5. Restore network
  // 6. Verify sync succeeds
});

test('Resilience: Show conflict to user', async ({ browser1, browser2 }) => {
  // 1. Edit same customer on both devices
  // 2. Force conflict scenario
  // 3. Verify conflict dialog shown
  // 4. User chooses resolution
  // 5. Verify sync continues
});

test('Slow Network: Streaming report', async ({ browser }) => {
  // 1. Simulate slow connection (throttle to 50 Mbps)
  // 2. Fetch large GST report
  // 3. Verify data streamed incrementally
  // 4. Verify not blocking UI
});

test('Slow Network: Timeout & fallback', async ({ browser }) => {
  // 1. Simulate 30s server latency
  // 2. Fetch with 10s timeout
  // 3. Verify timeout → fallback to local
  // 4. Verify app continues working offline
});

test('UI: Sync status bar', async ({ browser }) => {
  // Verify status bar shows correct state
  // - online (✓)
  // - syncing (⟳)
  // - offline (⊘)
  // - error (⚠)
});

test('UI: Pending sync badge on invoice', async ({ browser }) => {
  // Save invoice offline
  // Verify "Pending Sync" badge shown
  // Sync → badge disappears
});
```

### 7.9 Deliverables for Phase 5

- [ ] Retry logic with exponential backoff
- [ ] Conflict resolution dialog
- [ ] Streaming responses for large reports
- [ ] Request timeouts (fail fast on slow network)
- [ ] Sync status bar (persistent)
- [ ] Offline indicator
- [ ] "Pending Sync" badge on documents
- [ ] SQLite indexes for performance
- [ ] Prune old sync_outbox entries
- [ ] All Phase 5 E2E tests passing

**Success Criteria**:
- ✅ Works reliably on 2G networks (500ms latency)
- ✅ User knows what's syncing (status bar)
- ✅ Conflicts resolved gracefully
- ✅ App responsive even with slow network

---

## 8. Conflict Resolution Strategy

### 8.1 Conflict Types

| Type | Example | Resolution |
|------|---------|-----------|
| **Number Collision** | Two invoices get same number | Renumber one (server-authoritative) |
| **Edit Conflict** | Same field edited on 2 devices | Last-write-wins (by timestamp) |
| **State Machine** | Void then pay same invoice | Reject pay (state machine enforced) |
| **Referential** | Delete customer, invoice still references | Reject delete (foreign key enforced) |
| **Stock Conflict** | Negative stock on expensive item | Accept (append-only, not possible) |

### 8.2 Resolution Logic

```ts
// Server-side conflict detection and resolution
export async function detectAndResolveConflict(
  change: SyncChange,
  serverState: any,
  allDeviceChanges: SyncChange[]
): Promise<ConflictResolution> {
  
  switch (change.entity) {
    case 'invoices':
      return resolveInvoiceConflict(change, serverState, allDeviceChanges);
    
    case 'customers':
      return resolveCustomerConflict(change, serverState);
    
    case 'stock_adjustments':
      return { status: 'accept' };  // No conflicts possible (append-only)
    
    case 'stock_transfers':
      return resolveTransferConflict(change, serverState, allDeviceChanges);
    
    case 'credit_notes':
      return resolveCreditNoteConflict(change, serverState);
    
    default:
      return { status: 'accept' };
  }
}

function resolveInvoiceConflict(change, serverState, allDeviceChanges) {
  if (change.op === 'create') {
    // Check if this number already exists
    if (serverState.invoices.some(inv => inv.invoice_no === change.payload.invoice_no)) {
      // Number collision → renumber
      const nextAvailable = getNextAvailableInvoiceNumber();
      return {
        status: 'conflict',
        reason: 'number_collision',
        resolution: 'renumber',
        old_number: change.payload.invoice_no,
        new_number: nextAvailable
      };
    }
  } else if (change.op === 'update' && change.payload.status === 'void') {
    // Check if payment was also made (from different device)
    const payment = allDeviceChanges.find(c =>
      c.entity === 'payments' &&
      c.payload.invoice_id === change.entity_id &&
      c.timestamp > change.timestamp
    );
    
    if (payment) {
      // Payment after void → conflict
      return {
        status: 'conflict',
        reason: 'state_machine',
        resolution: 'reject_payment',
        message: 'Cannot accept payment after void'
      };
    }
  }
  
  return { status: 'accept' };
}

function resolveCustomerConflict(change, serverState) {
  // Last-write-wins: compare timestamps
  if (change.timestamp > serverState.updated_at?.getTime()) {
    return { status: 'accept', message: 'Local is newer' };
  } else {
    return { status: 'conflict', resolution: 'use_server' };
  }
}
```

### 8.3 Idempotency

All sync changes must be idempotent (can be replayed without side effects):

```ts
// POST /v1/sync/apply should be idempotent
// If network dropped, client may retry same batch

// Use database unique constraint + natural key
CREATE UNIQUE INDEX idx_sync_change_dedup
  ON sync_change_log (org_id, device_id, entity, entity_id, timestamp);

// On re-apply: check if already processed
const existing = await db.query.sync_change_log
  .findFirst({
    where: and(
      eq(org_id, org_id),
      eq(device_id, device_id),
      eq(entity, change.entity),
      eq(entity_id, change.entity_id),
      eq(timestamp, change.timestamp)
    )
  });

if (existing) {
  // Already processed; return cached response
  return {
    status: 'ok',
    processed: [change.entity_id],
    message: 'Already synced'
  };
}
```

---

## 9. Testing & Validation

### 9.1 Test Pyramid

```
┌─────────────────────────────────┐
│  E2E Tests (20%)                │
│  - Full app flow offline        │
│  - Multi-device scenarios       │
│  - Network conditions           │
├─────────────────────────────────┤
│  Integration Tests (40%)        │
│  - Sync engine tests            │
│  - Conflict resolution tests    │
│  - Local DB transactions        │
├─────────────────────────────────┤
│  Unit Tests (40%)               │
│  - Conflict detectors           │
│  - Merge logic                  │
│  - Formatters, validators       │
└─────────────────────────────────┘
```

### 9.2 E2E Test Scenarios

All tests in `tests/e2e/`:

```
- offline-pos-checkout.spec.ts
  ✓ Add items, save invoice, print receipt (no internet)
  ✓ Barcode scanner works offline
  ✓ Multiple invoices in quick succession

- offline-sync.spec.ts
  ✓ Save offline, sync when online
  ✓ Multiple changes batched in single sync
  ✓ Retry on network failure

- multi-device.spec.ts
  ✓ Device A and B both offline
  ✓ Create different invoices
  ✓ Both sync, no conflict
  ✓ Number renaming handled

- conflict-resolution.spec.ts
  ✓ Invoice number collision (renumber)
  ✓ Customer edited by two devices (merge)
  ✓ Void then pay (reject)
  ✓ Transfer create before receive (enforce order)

- slow-network.spec.ts
  ✓ 2G network (1 Mbps)
  ✓ 3G network (5 Mbps)
  ✓ Timeouts and fallback
  ✓ Streaming reports

- permissions.spec.ts
  ✓ Sync respects org_id (data isolation)
  ✓ Sync respects permissions
  ✓ User can't see other org's data
```

### 9.3 Test Infrastructure

```ts
// tests/fixtures/offline-device.ts
export async function createOfflineDevice(browser) {
  // 1. Launch browser
  // 2. Wait for app to load
  // 3. Simulate offline (DevTools Protocol)
  // 4. Return device handle with helpers
  
  return {
    async goOffline() {
      await page.context().setOffline(true);
    },
    async goOnline() {
      await page.context().setOffline(false);
    },
    async waitForSync() {
      await page.waitForSelector('[data-testid="sync-status-online"]');
    },
    async saveInvoice(data) {
      // POS save flow
    }
  };
}

// tests/fixtures/mock-server.ts
export async function createMockServer() {
  // Intercept /v1/sync/apply to simulate conflicts
  // Intercept network to simulate latency
  
  return {
    async addConflict(change: SyncChange) {
      // Next sync will return this as conflict
    },
    async setLatency(ms: number) {
      // Simulate slow network
    }
  };
}

// tests/e2e/multi-device.spec.ts
test('Two devices, number collision', async ({ browser1, browser2, mockServer }) => {
  const dev1 = await createOfflineDevice(browser1);
  const dev2 = await createOfflineDevice(browser2);
  
  // Both offline
  await dev1.goOffline();
  await dev2.goOffline();
  
  // Dev1 saves invoice #100
  await dev1.saveInvoice({ invoice_no: 100 });
  
  // Dev2 saves invoice #100 (both devices reserved 100-149)
  await dev2.saveInvoice({ invoice_no: 100 });
  
  // Dev1 comes online first
  await dev1.goOnline();
  await dev1.waitForSync();
  
  // Dev2 comes online
  await dev2.goOnline();
  await mockServer.addConflict({
    entity: 'invoices',
    reason: 'number_collision'
  });
  
  await dev2.waitForSync();
  
  // Verify resolution
  const invoices1 = await dev1.getInvoices();
  const invoices2 = await dev2.getInvoices();
  
  expect(invoices1).toHaveLength(2);
  expect(invoices2).toHaveLength(2);
  
  // One should be #100, other renumbered
  const numbers = [
    ...invoices1.map(i => i.invoice_no),
    ...invoices2.map(i => i.invoice_no)
  ];
  expect(numbers).toContain(100);
  expect(numbers).toContain(101);
});
```

---

## 10. Deployment & Migration

### 10.1 Database Migrations

Each phase requires backend migrations:

```bash
# Phase 1: Add sync_outbox wiring
pnpm db:migrate:create wire_sync_outbox_to_invoices

# Phase 2: Add master data versioning
pnpm db:migrate:create version_tax_rates

# Phase 3: Add stock_ledger triggers
pnpm db:migrate:create add_stock_ledger_protection

# etc.
```

Migration strategy:
- ✅ Backwards compatible (old app continues working)
- ✅ Can rollback (no data deletion)
- ✅ Tested on staging with production data dump

### 10.2 API Versioning

New sync endpoints are under `/v1/sync/` (not `/v1/`), allowing old clients to keep working:

```
Old app (v1.0):
  GET /v1/invoices → read from server only

New app (v1.1):
  GET /v1/invoices → read from local, OR server if not cached
  POST /v1/sync/apply → push changes
  GET /v1/sync/changes → pull changes
```

### 10.3 Rollout Phases

1. **Week 1-2**: Deploy Phase 0 infrastructure (sync routes, no client changes yet)
2. **Week 3-6**: Gradually rollout Phase 1 (POS offline)
   - Start with 5% of devices
   - Monitor error rates, sync success rates
   - Expand to 25%, then 100%
3. **Week 7+**: Continue phases 2-5

### 10.4 Monitoring & Metrics

Track:
- Sync success rate (%) per device
- Average sync duration (ms)
- Conflict detection rate (%)
- Conflict resolution rate (%)
- Network failure recovery time (s)
- Local DB size (MB)
- Pending sync count (total across org)

```ts
// Backend: Emit metrics
ctx.log.info({
  sync_push: {
    devices_synced: 1,
    changes_applied: 42,
    conflicts_detected: 2,
    duration_ms: 145,
    error: null
  }
}, 'sync completed');
```

---

## 11. Rollout Checklist

### Pre-Launch

- [ ] All unit tests passing (target: >90% coverage)
- [ ] All integration tests passing
- [ ] All E2E tests passing (all 50+ scenarios)
- [ ] Performance tested on 2G network (2s to complete a sync)
- [ ] Staging environment mirrors production (same DB size)
- [ ] Load test: 1000 concurrent syncs, verify no data loss
- [ ] Security audit: No auth bypass, data leaks, or SQL injection
- [ ] Documentation complete (sync protocol, conflict resolution, troubleshooting)

### Day 1 (Soft Launch)

- [ ] Deploy Phase 0 to production
- [ ] Deploy sync routes (API only, no client changes)
- [ ] Monitor error rates (should be 0)
- [ ] Verify sync_outbox table populated correctly

### Day 2-7 (Phase 1: POS)

- [ ] Deploy updated web app (POS offline support)
- [ ] Roll out to 5% of devices (beta testers)
- [ ] Monitor:
  - Sync push success rate
  - Sync pull success rate
  - Local DB integrity
  - Stock balance accuracy
- [ ] Expand to 25% if success rate > 99%
- [ ] Expand to 100% if success rate > 99.5%

### Week 2-4 (Phases 2-5)

- [ ] Continue rolling out in 25% increments
- [ ] Add new modules (master data, inventory, purchases)
- [ ] Monitor cumulative metrics

### Rollback Plan

If any critical issue:

1. **Stop rollout** — Don't push to more devices
2. **Isolate affected devices** — Prevent further sync damage
3. **Restore data** — Roll back to last known-good backup
4. **Disable sync** — Old clients continue working (read-only from server)
5. **Fix in staging** — Debug and test thoroughly
6. **Re-deploy** — Only when root cause fixed and tested

---

## 12. Success Criteria (Overall)

### Phase 0 Completion
- ✅ Sync infrastructure in place
- ✅ No data loss in stress testing
- ✅ API responding correctly
- ✅ All tests passing

### Phase 1 Completion
- ✅ POS works completely offline
- ✅ Invoices save and sync conflict-free
- ✅ Stock deducted accurately
- ✅ Print receipts offline
- ✅ 99%+ sync success rate

### Phase 2 Completion
- ✅ Master data synced on login
- ✅ Search works offline
- ✅ Create/edit customers, items offline
- ✅ Conflicts merged correctly

### Phase 3 Completion
- ✅ Stock adjustments, transfers offline
- ✅ Stock balances accurate
- ✅ No orphaned transfers
- ✅ Append-only ledger prevents conflicts

### Phase 4 Completion
- ✅ Full purchase flow offline
- ✅ Production orders work offline
- ✅ Credit notes validate on sync
- ✅ RCM calculated offline

### Phase 5 Completion
- ✅ Works on 2G networks (500ms latency)
- ✅ Retry/backoff working
- ✅ Conflict UI clear and usable
- ✅ Sync status always visible
- ✅ Zero data loss in all test scenarios
- ✅ Ready for production

---

## Appendix: Risk Mitigation

### Risk: Data Corruption in Stock Ledger

**Mitigation**:
- Stock_ledger append-only enforced by DB trigger
- Running balance recomputed on every sync
- Audit log tracks every entry
- Daily integrity check job: verify ∑qty_in - ∑qty_out = final_balance

### Risk: Invoice Number Exhaustion

**Mitigation**:
- Reservation system prevents collision
- Renumbering on sync handles edge cases
- Monitor reservation usage
- Alert admin if reserve pool < 10%

### Risk: Offline Device Sync Storm

**Mitigation**:
- Rate limit sync endpoint (100 changes per 10s per device)
- Batch changes server-side
- Exponential backoff on client
- Prioritize critical transactions (invoices > master data)

### Risk: Large Local DB Size

**Mitigation**:
- Index aggressively for query performance
- Prune old sync_outbox entries (>30 days)
- Lazy-load images (don't store full-res locally)
- Monitor local DB size, alert if > 500 MB

---

## Appendix: Code Organization

### Backend (apps/api/src)

```
routes/
├── sync.ts (new)
│   ├── POST /v1/sync/apply
│   ├── GET /v1/sync/changes
│   └── WS /v1/ws/sync

services/
├── sync-service.ts (new)
│   ├── detectConflict()
│   ├── resolveConflict()
│   └── applyChange()

middleware/
├── sync-validator.ts (new)
└── (existing auth, org_id, etc.)
```

### Frontend (apps/web/src)

```
lib/
├── sync-client.ts (new)
├── local-db.ts (new)
└── (existing api-client.ts)

stores/
├── sync-store.ts (new, Zustand)
└── (existing auth-store.ts)

hooks/
├── useSyncStatus.ts (new)
├── useItemSearch.ts (updated)
└── (existing hooks)

components/
├── SyncStatusBar.tsx (new)
├── ConflictDialog.tsx (new)
└── (existing components)
```

### Packages

```
packages/
├── sync/ (new)
│   ├── protocol.ts
│   ├── client.ts
│   ├── server.ts
│   └── conflict-resolver.ts

├── local-db/ (new)
│   ├── schema.ts
│   ├── db.ts
│   └── migrations/

├── schemas/ (updated)
│   └── sync.ts (new sync types)

└── (existing db, utils, tax, i18n)
```

---

**Document Last Updated**: 2026-07-30  
**Prepared for**: Counter Offline-First Initiative  
**Status**: Ready for Implementation Planning Meeting

