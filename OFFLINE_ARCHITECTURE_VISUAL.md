# Counter Offline-First: Visual Architecture

## Current State vs Target State

### ❌ Current Architecture (Online-Only)
```
┌─────────────────────────────────────────────────┐
│             Browser / Desktop App               │
│                                                 │
│   React + TanStack Query + Zustand              │
│   ├─ All data fetched on-demand from API       │
│   ├─ No local storage of business data         │
│   └─ Completely broken when offline            │
│                                                 │
└─────────────┬───────────────────────────────────┘
              │
              │ Every Operation
              │ Requires Internet
              │
              ▼
┌─────────────────────────────────────────────────┐
│          Fastify API Server                     │
│                                                 │
│   PostgreSQL Database (Remote)                  │
│   ├─ invoices, customers, items, stock_ledger │
│   ├─ Only source of truth                      │
│   └─ Single point of failure                   │
│                                                 │
└─────────────────────────────────────────────────┘

Problems:
❌ Field sales can't work offline
❌ Breaks on slow networks (free tier DBs)
❌ No local cache of items/customers
❌ Every click = API call
❌ Unusable in rural areas
```

### ✅ Target Architecture (Offline-First + Sync)
```
┌──────────────────────────────────┐
│    Browser / Tauri / Mobile      │
│                                  │
│  ┌──────────────────────────────┐│
│  │   React App Layer            ││
│  │   ├─ POS screen              ││
│  │   ├─ Invoice form            ││
│  │   └─ Stock reports           ││
│  └──────────────────────────────┘│
│           │                      │
│           ▼                      │
│  ┌──────────────────────────────┐│
│  │  Local SQLite Database       ││
│  │  (~500 MB)                   ││
│  │  ├─ invoices                 ││
│  │  ├─ customers                ││
│  │  ├─ items                    ││
│  │  ├─ stock_ledger             ││
│  │  ├─ sync_outbox (queue)      ││
│  │  └─ [mirrors server schema]  ││
│  └──────────────────────────────┘│
│           │        ▲             │
│      WORKS │        │ ON-DEMAND  │
│    OFFLINE │        │            │
│           ▼        │             │
│  ┌──────────────────────────────┐│
│  │  Sync Engine                 ││
│  │  ├─ queue changes            ││
│  │  ├─ detect conflicts         ││
│  │  └─ merge remote changes     ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
           │
           │ When Network Available
           │ - POST /v1/sync/apply (push)
           │ - GET /v1/sync/changes (pull)
           │ - WS /v1/ws/sync (real-time)
           │
           ▼
┌──────────────────────────────────┐
│    Fastify API + PostgreSQL      │
│                                  │
│  ┌──────────────────────────────┐│
│  │  Sync Processor              ││
│  │  ├─ Process changes          ││
│  │  ├─ Detect conflicts         ││
│  │  ├─ Apply atomically         ││
│  │  └─ Broadcast to all devices ││
│  └──────────────────────────────┘│
│           │                      │
│           ▼                      │
│  ┌──────────────────────────────┐│
│  │  PostgreSQL Database         ││
│  │  (Single Source of Truth)    ││
│  │  ├─ Conflict resolution logs ││
│  │  ├─ Audit trail              ││
│  │  └─ Invoice numbers assigned ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘

Benefits:
✅ Works completely offline
✅ Handles slow networks gracefully
✅ Multi-device sync conflict-free
✅ Data safe locally (SQLite ACID)
✅ Transparent sync in background
```

---

## Data Flow: Invoice Creation Offline

```
Step 1: USER ADDS ITEM TO CART
────────────────────────────────
Device (Offline)              Local SQLite
    │
    ├─ Search items ──────────►  SELECT * FROM items WHERE name LIKE ?
    │  (no internet!)          (instant, local)
    │
    └─ Get stock balance ─────►  SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0)
       (no internet!)             FROM stock_ledger WHERE item_id = ?


Step 2: USER SAVES INVOICE
────────────────────────────────
Device (Offline)              Local SQLite          Sync Queue
    │
    ├─ Get next number ──────────►  SELECT next_number FROM invoice_series
    │  (from reservation)          (already reserved: #100-149)
    │
    ├─ Write invoice ────────────►  INSERT INTO invoices (id, invoice_no, items...)
    │                              (sync_status = 0, pending)
    │
    ├─ Write lines ──────────────►  INSERT INTO invoice_lines (...)
    │
    ├─ Deduct stock ─────────────►  INSERT INTO stock_ledger (qty_out, ref=invoice)
    │  (running balance updated)    (balance_qty = prev - qty)
    │
    ├─ Queue for sync ───────────────────►  INSERT INTO sync_outbox
    │  (in local DB)                      { entity: 'invoices', op: 'create' }
    │
    └─ UPDATE UI: "✓ Saved"


Step 3: PRINT RECEIPT
────────────────────────────────
Device (Offline)              Local SQLite
    │
    ├─ Read invoice ─────────────►  SELECT * FROM invoices WHERE id = ?
    │  (no internet!)
    │
    ├─ Read lines ───────────────►  SELECT * FROM invoice_lines WHERE invoice_id = ?
    │
    ├─ Read org settings ────────►  SELECT * FROM org_settings
    │
    └─ Render HTML → Print (no network call)


Step 4: NETWORK RETURNS (User Travels)
────────────────────────────────────────
Device (Online Now)           Sync Engine               Server API
    │
    ├─ Detect network ──────────────┐
    │  (setInterval every 10s)      │
    │                               │
    ├─ SYNC PUSH ───────────────────────►  POST /v1/sync/apply
    │  {                                  {
    │    device_id: 'dev-1',                 changes: [
    │    changes: [                            {
    │      {                                     entity: 'invoices',
    │        entity: 'invoices',                 entity_id: '...',
    │        entity_id: '...',                   op: 'create',
    │        op: 'create',                      payload: {...}
    │        payload: {...}                   }
    │      }                               ]
    │    ]                              }
    │  }                                    │
    │                                  ┌───┴──────────────┐
    │                                  │ Server Processing
    │                                  ├─ Check for conflicts
    │                                  ├─ Validate invoice
    │                                  ├─ Verify stock available
    │                                  ├─ Assign final invoice #
    │                                  ├─ Write audit log
    │                                  └─ Response:
    │  ◄───────────────────────────────┤ {
    │                                  │   ok: true,
    │                                  │   processed: ['invoice-id'],
    │                                  │   conflicts: []
    │                                  │ }
    │
    ├─ UPDATE LOCAL DB
    │  UPDATE invoices SET sync_status = 1 WHERE id = ?
    │
    ├─ DELETE FROM sync_outbox
    │  (entry processed, can clean up)
    │
    ├─ SYNC PULL ───────────────────────►  GET /v1/sync/changes?since_seq=X
    │                                      (fetch changes from other devices)
    │                                  ◄──
    │                                  {
    │                                    changes: [
    │                                      {device: 'dev-2', entity: 'customers',
    │                                       op: 'update', ...}
    │                                    ]
    │                                  }
    │
    ├─ MERGE REMOTE CHANGES
    │  UPDATE local DB with changes from other devices
    │
    └─ UPDATE UI: "✓ Synced"
```

---

## Conflict Resolution: Invoice Number Collision

```
Timeline:
─────────────────────────────────────────────────────────────

Time    Device A (Offline)          Device B (Offline)
  0:00  │                           │
        ├─ Reserved #100-149        ├─ Reserved #100-149
        │                           │
  0:30  ├─ Save Invoice #100        │
        │  sync_status = 0          │
        │ (pending sync)            │
        │                           ├─ Save Invoice #100
        │                           │  sync_status = 0
        │                           │ (pending sync)
        │                           │
  1:00  ├─ Network back             │
        │  (device A online first)  │
        │                           │
  1:05  ├─ SYNC PUSH               │
        │ "Here's my invoice #100"  │
        │     ─────────►  SERVER    ├─ Network back
        │                           │
        │              ◄─ OK        │
        │          Processed        │
        │                           │
  1:10  │                           ├─ SYNC PUSH
        │                           │ "Here's my invoice #100"
        │                           │     ─────────►  SERVER
        │                           │
        │                           ◄─ CONFLICT!
        │                           │ {
        │                           │   reason: 'number_collision',
        │                           │   old_num: 100,
        │                           │   new_num: 150
        │                           │ }
        │                           │
  1:15  │                           ├─ SYNC PULL
        │                           │ "What changed?"
        │                           │     ◄─────  SERVER
        │                           │        {
        │                           │          conflicts: [{...}],
        │                           │          updated_invoice: {
        │                           │            id: '...',
        │                           │            invoice_no: 150  ← RENUMBERED
        │                           │          }
        │                           │        }
        │                           │
        │                           ├─ LOCAL MERGE
        │                           │  UPDATE invoices
        │                           │  SET invoice_no = 150,
        │                           │      sync_status = 1
        │                           │
        │                           ├─ UI: "Invoice renumbered to #150"
        │                           │
        │                           └─ AUDIT LOG
        │                              Invoice #100 → #150 (due to collision)


Result:
───────
Server State:
  Invoice A: #100 (from Device A)
  Invoice B: #150 (from Device B, renumbered)

Device A Local DB:
  Invoice A: #100 (sync_status = 1, synced ✓)

Device B Local DB:
  Invoice B: #150 (sync_status = 1, synced ✓)
             ↑ Updated after pull

Audit Log:
  { action: 'renumber', invoice_id: 'B', old_no: 100, new_no: 150, reason: 'collision' }

User Experience:
  Device A: "✓ Invoice saved (#100)"
  Device B: "✓ Invoice saved (#100)" → "⚠ Renumbered to #150 due to conflict"
```

---

## Sync Queue & Retry Logic

```
Scenario: Multiple changes queued, network drops mid-sync

Local Sync Outbox:
───────────────────────
ID │ Entity      │ Op     │ Status    │ Timestamp
───┼─────────────┼────────┼───────────┼──────────
1  │ invoices    │ create │ synced    │ 10:00
2  │ customers   │ update │ pending   │ 10:05
3  │ items       │ update │ pending   │ 10:10
4  │ payments    │ create │ pending   │ 10:15


Sync Loop:
──────────
10:20  Batch attempt 1 (IDs: 2, 3, 4)
       ├─ Network → Server
       │ POST /v1/sync/apply { changes: [2, 3, 4] }
       │
       ├─ Server processes...
       │ ✓ ID 2 (customer): Success
       │ ✓ ID 3 (item): Success
       │ ✗ ID 4 (payment): Conflict (customer not found)
       │
       └─ Response: { processed: [2, 3], conflicts: [4] }

10:21  Update Local:
       ├─ Mark 2, 3 as synced
       ├─ Add 4 to conflicts log (show to user)
       └─ Keep 4 in outbox for retry

10:25  Retry attempt 2 (only ID: 4)
       ├─ Wait 5s (exponential backoff) ✓
       ├─ Network → Server
       │ POST /v1/sync/apply { changes: [4] }
       │
       ├─ Server processes...
       │ ✓ ID 4 (payment): Success now
       │
       └─ Response: { processed: [4], conflicts: [] }

10:26  Update Local:
       ├─ Mark 4 as synced
       ├─ Delete 4 from outbox (processed)
       └─ UI: "All changes synced ✓"

Exponential Backoff Timeline:
─────────────────────────────
Attempt 1: Immediate
Attempt 2: Wait 1s, retry
Attempt 3: Wait 2s, retry
Attempt 4: Wait 4s, retry
Attempt 5: Wait 8s, retry
Attempt 6+: Wait 15s, retry (max backoff)

Each retry adds ~10% jitter to prevent thundering herd.
```

---

## Stock Ledger: Append-Only Design

```
Why Append-Only?
────────────────
Traditional table would have UPDATE/DELETE issues offline:
  ❌ Device A: Deduct 10 (offline)
  ❌ Device B: Deduct 5 (offline)
  ❌ On merge: Which deduction is "correct"?

Append-Only ledger has NO conflicts:
  ✓ Device A: Deduct 10 → creates entry
  ✓ Device B: Deduct 5 → creates separate entry
  ✓ On merge: Both entries exist, sum them up
  ✓ Running balance: 0 - 10 - 5 = -15 (deterministic)


Example Flow:
──────────────

Initial State:
  Item: Apple
  Location: Shop Counter
  Balance: 100 units


Invoice #1 (Dev A, offline, 10:00):
  ┌─────────────────────────────┐
  │ stock_ledger entry          │
  ├─────────────────────────────┤
  │ item_id: apple              │
  │ qty_in: 0                   │
  │ qty_out: 5                  │
  │ balance_qty: 95             │
  │ txn_type: sales_out         │
  │ created_at: 10:00           │
  │ device_id: dev-a            │
  └─────────────────────────────┘


Invoice #2 (Dev B, offline, 10:05):
  ┌─────────────────────────────┐
  │ stock_ledger entry          │
  ├─────────────────────────────┤
  │ item_id: apple              │
  │ qty_in: 0                   │
  │ qty_out: 3                  │
  │ balance_qty: 92             │
  │ txn_type: sales_out         │
  │ created_at: 10:05           │
  │ device_id: dev-b            │
  └─────────────────────────────┘


Both devices sync at 10:10:
  ┌─────────────────────────────────────────────────┐
  │ Server combines entries (order by timestamp):   │
  ├─────────────────────────────────────────────────┤
  │ Entry 1 (dev-a, 10:00): balance = 100 - 5 = 95 │
  │ Entry 2 (dev-b, 10:05): balance = 95 - 3 = 92  │
  └─────────────────────────────────────────────────┘

Result:
  ✓ Final balance: 92 units
  ✓ No conflicts
  ✓ Both sales recorded
  ✓ Audit trail complete
  ✓ Deterministic (order by timestamp)
```

---

## Testing Strategy Pyramid

```
                    ┌──────────────┐
                    │   E2E Tests  │  (50 tests)
                    │  ~20% effort │  ├─ Full offline flow
                    │              │  ├─ Multi-device sync
                    │              │  ├─ Conflict scenarios
                    │              │  └─ Network conditions
                    └──────────────┘
                   ╱────────────────╲
                  ╱                  ╲
          ┌──────────────────────────┐
          │ Integration Tests        │  (100 tests)
          │      ~40% effort         │  ├─ Sync engine
          │                          │  ├─ Conflict detection
          │                          │  ├─ DB transactions
          │                          │  └─ API routes
          └──────────────────────────┘
       ╱──────────────────────────────────╲
      ╱                                    ╲
  ┌─────────────────────────────────────────┐
  │        Unit Tests                       │  (200 tests)
  │         ~40% effort                     │  ├─ Formatters
  │                                         │  ├─ Validators
  │                                         │  ├─ Merge logic
  │                                         │  └─ Retry logic
  └─────────────────────────────────────────┘

Coverage Target: >85% critical paths
Test Execution: <5 minutes (full suite)
```

---

## Deployment Rollout Strategy

```
Week 1-2: Phase 0 (Foundation)
──────────────────────────────
   SERVER
   ├─ Deploy sync routes (/v1/sync/apply, /v1/sync/changes, /v1/ws/sync)
   ├─ Deploy conflict resolution logic
   └─ All old clients continue working (unaffected)

   Status: ✓ Ready for phase 1

Week 3-4: Phase 1 (POS Offline) - Gradual Rollout
──────────────────────────────────────────────────

   5% rollout (5 beta devices):
   ├─ Deploy new client (POS offline support)
   ├─ Monitor: sync success %, error rates, data integrity
   ├─ Target: >99% sync success
   └─ Duration: 2-3 days

   25% rollout (25 devices):
   ├─ Expand to trusted power users
   ├─ Monitor: same metrics
   ├─ Target: >99.5% sync success
   └─ Duration: 3-5 days

   100% rollout (all devices):
   ├─ Full deployment
   ├─ Final monitoring period: 1 week
   └─ Success: All devices working offline

Week 5-6: Phase 2 (Master Data) - Gradual Rollout
─────────────────────────────────────────────────
   ├─ Same strategy: 5% → 25% → 100%
   ├─ Disable if issues > 0.5% sync fail rate
   └─ Estimated duration: 2 weeks

Week 7-12: Phases 3-5 (Inventory, Purchases, Polish)
───────────────────────────────────────────────────
   ├─ Continue gradual rollout (2 weeks per phase)
   ├─ Parallel testing of each phase
   └─ Full offline platform by week 12


Rollback Procedure (if critical issue):
────────────────────────────────────────
IF (sync_fail_rate > 1% OR data_loss_detected) THEN:
   ├─ STOP rollout (no new devices)
   ├─ REVERT client (users get old version)
   ├─ RESTORE from backup (if needed)
   ├─ INVESTIGATE root cause in staging
   ├─ FIX and re-test thoroughly
   └─ RE-DEPLOY only when verified safe

  Timeline: <4 hours from detection to fix
```

---

## Performance Targets

```
Local Operations (Offline):
──────────────────────────
Operation              Target    Why
─────────────────────────────────────────────────────
Save invoice           <100ms    User expects instant save
Print receipt          <500ms    Printer driver delay
Search items           <50ms     User typing speed
Get stock balance      <10ms     Part of invoice save
Sync push (100 changes) <2s      Background, but responsive

Network Operations (Online):
────────────────────────────
Operation              Target    Condition
─────────────────────────────────────────────────────
Sync push              <2s       3G network (5 Mbps)
Sync pull              <2s       3G network
Conflict resolution    <500ms    Server processing
Bootstrap (sync all)   <10s      2G network (500 Kbps)
Print from server      <3s       HTML rendering + PDF

Local Database Size:
──────────────────────────
Component          Target    ~30 days worth
─────────────────────────────────────────────
items              20 MB     ~5000 items
customers          5 MB      ~10000 customers
recent invoices    100 MB    ~30 days of sales
stock_ledger       200 MB    All movements
Sync outbox        10 MB     Pending changes
Other              65 MB     Misc
─────────────────────────────────────────────
TOTAL              ~500 MB   Comfortable on modern phone
```

---

## Summary: What Gets Built

```
┌─ Backend (apps/api/src)
│  ├─ routes/sync.ts (3 endpoints + WebSocket)
│  ├─ services/sync-service.ts (conflict detection)
│  └─ middleware/sync-validator.ts
│
├─ Packages (new)
│  ├─ packages/sync/ (sync engine: client + server)
│  ├─ packages/local-db/ (SQLite schema + migrations)
│  └─ packages/schemas/ (sync types)
│
├─ Frontend (apps/web/src)
│  ├─ lib/sync-client.ts (queue, retry, merge)
│  ├─ lib/local-db.ts (SQLite wrapper)
│  ├─ stores/sync-store.ts (Zustand)
│  ├─ hooks/useSyncStatus.ts (UI integration)
│  ├─ components/SyncStatusBar.tsx
│  ├─ components/ConflictDialog.tsx
│  └─ pages/pos.tsx (updated for offline)
│
└─ Tests
   ├─ 200+ unit tests
   ├─ 100+ integration tests
   └─ 50+ E2E tests
```

---

## Key Takeaways

| What | Why | How |
|------|-----|-----|
| **Local SQLite** | Store data offline, don't lose work | Mirror server schema, ~500 MB max |
| **Sync Engine** | Push/pull changes, handle conflicts | 3 endpoints + WebSocket |
| **Conflict Resolution** | Multi-device coordination | Server-authoritative, last-write-wins, business rules |
| **Gradual Rollout** | Minimize risk, catch bugs early | 5% → 25% → 100% per phase |
| **Audit Trail** | Compliance + debugging | Every change logged with who/when/device |
| **Stock Ledger** | Zero conflict on inventory | Append-only design, recompute balance |

---

## Next Meeting Agenda

1. ✅ Review this architecture
2. ✅ Align on tech stack (better-sqlite3 vs sql.js vs dexie.js)
3. ✅ Assign team & schedule
4. ✅ Create Phase 0 epics
5. ✅ Set success criteria per phase
6. ✅ Plan for staging environment

**Status**: Ready to start Phase 0 implementation

---

Created: 2026-07-30  
For: Counter Development Team  
Purpose: Visual reference for offline-first architecture
