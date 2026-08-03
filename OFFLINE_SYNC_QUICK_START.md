# Counter Offline-First: Quick Start Guide

## Document Locations

1. **Full Implementation Plan** → `OFFLINE_SYNC_IMPLEMENTATION_PLAN.md` (detailed, phase-by-phase)
2. **Codebase Analysis** → `/private/tmp/.../counter-analysis.md` (current structure)
3. **This File** → Quick reference and next steps

---

## Current Status: ❌ NOT OFFLINE-CAPABLE

**What Works**:
- ✅ Service worker caches app shell (HTML/CSS/JS)
- ✅ PWA manifest exists
- ✅ Can open app on cached device

**What Doesn't Work**:
- ❌ Cannot save any data offline (invoices, customers, items, etc.)
- ❌ No local database (SQLite)
- ❌ No sync mechanism
- ❌ Every operation requires live internet
- ❌ Fails completely on slow networks (free tier DBs, poor connectivity)

**Impact**: **CRITICAL** — Blocks rural/field sales where internet is unreliable

---

## The Solution: Local-First + Sync Architecture

### How It Works

```
Device A (Offline)         Device B (Online)         Server
    │                           │                        │
    ├─ Save Invoice ────┐       │                        │
    │ (to SQLite)       │       │                        │
    │                   │       ├─ Save Invoice ───┐     │
    ├─ Stock Ledger ────┤       │ (API call)       │     │
    │ (local)           │       │                  │     ├─ Process
    │                   │       ├─ Stock Ledger ─┬─┼─────┤ Sync
    ├─ Queue Sync ──────┤       │ (API call)     │ │     │
    │ (local outbox)    │       │                │ │     ├─ Audit
    │                   │       ├─ Sync Push ───┘ │     │
    │ [Network Returns] │       │                 │     ├─ Broadcast
    │                   │       │                 ├─────┤ to other
    ├─ Sync Push ───────────────┼─────────────────┘     ├─ devices
    │ (batched changes) │       │                       │
    │                   │       ├─ Sync Pull ◄─────────┤
    │                   │       │                       │
    ├─ Sync Pull ◄──────────────┼──────────────────────┤
    │ (remote changes)  │       │                       │
    │                   │       │                       │
    └─ Merge & Update  │       └─ Merge & Update        │
      (local DB)        │         (local DB)             │
                        │                                │
                        └────► Ready for next sync ─────┘
```

### 5 Implementation Phases

| Phase | Modules | Duration | Impact |
|-------|---------|----------|--------|
| **0** | Foundation (sync engine, local DB, conflict resolution) | 2-3w | Infrastructure ready |
| **1** | POS & Sales Invoices (highest priority) | 3-4w | **GAME CHANGER** — Field sales work offline |
| **2** | Master Data (items, customers, vendors) | 2-3w | Search/lookup work offline |
| **3** | Inventory (stock adjustments, transfers) | 2-3w | Stock tracking accurate |
| **4** | Purchases & Manufacturing | 2-3w | Full transaction suite |
| **5** | Resilience & Polish (retry, slow networks, UI) | 2-3w | Production-ready |

**Total**: ~16-20 weeks (4-5 person-months)

---

## Key Architecture Decisions

### 1. **Local SQLite Database**
- ✅ Use **better-sqlite3** for Tauri/Node
- ✅ Use **sql.js** or **wa-sqlite** for web/PWA
- ✅ Mirror server schema (simplified, no foreign keys)
- ✅ ~500 MB max local storage (items + customers + recent invoices)

### 2. **Sync Protocol**
- ✅ `POST /v1/sync/apply` — push local changes to server
- ✅ `GET /v1/sync/changes` — pull remote changes
- ✅ `WS /v1/ws/sync` — real-time broadcasts
- ✅ Idempotent (can retry without side effects)

### 3. **Conflict Resolution Strategy**
| Scenario | Strategy |
|----------|----------|
| Invoice number collision | Server renumbers (authoritative) |
| Same field edited by 2 devices | Last-write-wins (by timestamp) |
| Void then pay same invoice | Reject payment (state machine) |
| Stock ledger (append-only) | No conflicts possible; recompute balance |

### 4. **Data Sync Categories**
- **Transactional** (invoices, payments, purchases): ↔ bidirectional, conflicts possible
- **Master Data** (items, customers): ↔ bidirectional, low conflict (rare edits)
- **Reference** (tax rates, units): ← server-only, no conflicts
- **Reporting** (audit log, stock ledger): ← server-only append, no conflicts

---

## Phase 0: Foundation (2-3 Weeks)

**Deliverables**:
- [ ] `packages/sync` — sync engine (client + server)
- [ ] `packages/local-db` — SQLite schema + migrations
- [ ] Backend routes: `/v1/sync/apply`, `/v1/sync/changes`, `/v1/ws/sync`
- [ ] Frontend: `useSyncStatus()` hook, `syncStore` (Zustand)
- [ ] Background sync task (retry every 30s, pull every 60s)
- [ ] Conflict detection logic
- [ ] All tests passing

**Code Changes Required**:

```
apps/api/src/routes/
├── sync.ts (new, ~200 LOC)

packages/
├── sync/ (new package)
│   ├── src/
│   │   ├── protocol.ts (types)
│   │   ├── client.ts (sync logic)
│   │   ├── server.ts (conflict detection)
│   │   └── conflict-resolver.ts (merge strategies)
│
├── local-db/ (new package)
│   ├── src/
│   │   ├── schema.ts (SQLite schema)
│   │   ├── db.ts (connection + migrations)
│   │   └── migrations/001_initial.ts

├── schemas/
│   └── src/sync.ts (new sync types, ~100 LOC)

apps/web/src/
├── lib/
│   ├── sync-client.ts (new)
│   └── local-db.ts (new)
│
├── stores/
│   └── sync-store.ts (new, Zustand store)
│
├── hooks/
│   └── useSyncStatus.ts (new)
```

**Success Criteria**:
- ✅ Can queue a change locally
- ✅ Can push to server without conflicts
- ✅ Can pull remote changes
- ✅ Can detect & handle simple conflicts
- ✅ Sync outbox populated correctly

---

## Phase 1: POS & Sales Invoices (3-4 Weeks)

**Why This Phase First?**
- 📊 Highest ROI (80% of use case for field sales)
- 🎯 Highest pain point (sales reps can't work offline)
- 🏃 Fastest to market (core + inventory)

**Deliverables**:
- [ ] POS screen works completely offline
- [ ] Invoice number reservation (client reserves range of 50)
- [ ] Stock ledger entries written offline
- [ ] Receipt printing (no internet needed)
- [ ] Invoice sync with conflict resolution (number renaming)
- [ ] Customer lookup works offline (cached on login)
- [ ] Barcode scanner works offline

**Code Changes**:
```
apps/web/src/pages/
├── pos.tsx (update)
│   ├── Add local DB writes
│   ├── Use reserved invoice numbers
│   ├── Generate stock ledger entries
│   └── Queue for sync

apps/api/src/routes/
├── invoices.ts (update)
│   └── POST /v1/invoices/reserve-range (new)
│
├── sync.ts (update)
│   └── Add invoice number conflict resolution
```

**Key Flow**:
1. Login → reserve 50 invoice numbers (from server)
2. POS save → write to local SQLite (sync_status=0)
3. Stock deducted locally (stock_ledger entry)
4. UI shows "Saved ✓" immediately (optimistic)
5. Network available → push to server
6. Server detects conflicts (number collision?) → resolve
7. Server broadcasts to all other devices
8. Device receives confirmation → marks as synced (sync_status=1)

---

## Phase 2: Master Data (2-3 Weeks)

**Deliverables**:
- [ ] Bootstrap endpoint (`GET /v1/sync/bootstrap`) syncs all master data
- [ ] Items fully synced (metadata + images cached)
- [ ] Customers/vendors fully synced
- [ ] Search works offline (fuse.js)
- [ ] Create customer offline (conflicts merged on sync)
- [ ] Edit item offline (last-write-wins merge)
- [ ] Barcode scanner works offline

**What's Synced**:
- Items (with barcodes)
- Customers (with addresses)
- Vendors
- Tax rates (all versions, for historical invoices)
- Units, categories, brands
- Locations, branches
- Price tiers, payment modes
- Invoice series (with next_number reservation)

---

## Phase 3: Inventory (2-3 Weeks)

**Deliverables**:
- [ ] Stock adjustments work offline
- [ ] Stock transfers (create + receive) work offline
- [ ] Running balance computed offline
- [ ] Causality enforced on sync (create before receive)
- [ ] Stock reports work offline (query local ledger)

**Key Insight**: Stock ledger is **append-only**, so there are NO conflicts. Multiple devices can write entries, and server just recomputes running balance.

---

## Phase 4: Purchases & Manufacturing (2-3 Weeks)

**Deliverables**:
- [ ] Purchase invoices work offline (same as sales)
- [ ] Credit notes with validation
- [ ] BOMs synced (master data)
- [ ] Production orders (consume RM, output FG)
- [ ] RCM calculated offline

---

## Phase 5: Resilience & Polish (2-3 Weeks)

**Deliverables**:
- [ ] Retry with exponential backoff
- [ ] Conflict UI (show user when conflict detected)
- [ ] Sync status bar (top of app: ✓ Synced / ⟳ Syncing / ⊘ Offline / ⚠ Error)
- [ ] "Pending Sync" badge on documents
- [ ] Works on 2G networks (500ms latency)
- [ ] Timeouts & fallback to local
- [ ] Streaming responses for large reports
- [ ] SQLite indexes for fast queries

---

## Next Steps

### Immediate (This Week)

1. **Read the full plan** → `OFFLINE_SYNC_IMPLEMENTATION_PLAN.md`
2. **Review codebase analysis** → Current structure documented
3. **Architecture review** → Align on conflict resolution, data partitioning
4. **Estimate resources** → Assign developers (suggest 2-3 full-time)

### Week 1-2 (Planning & Setup)

1. Create `packages/sync` and `packages/local-db`
2. Set up build/test infrastructure
3. Define project board (GitHub Issues + Projects)
4. Create development database (for local testing)

### Week 3+ (Development)

1. Phase 0 implementation
2. Ongoing: unit tests, integration tests, E2E tests
3. Code review + QA
4. Staging rollout (internal testing)
5. Production rollout (gradual, 5% → 25% → 100%)

---

## Testing Strategy

### Unit Tests (~200 tests)
- Conflict detection logic
- Merge strategies
- Formatters & validators
- Retry logic

### Integration Tests (~100 tests)
- Sync push/pull
- Local DB transactions
- Conflict resolution end-to-end
- Stock ledger correctness

### E2E Tests (~50 tests)
- Full app flow: offline save → sync → verify
- Multi-device scenarios
- Network conditions (2G, 3G, timeout)
- Conflict UI and resolution

**Target Coverage**: >85% for critical paths

---

## Success Metrics

### Phase 1 Launch
- ✅ POS invoices work completely offline
- ✅ 99%+ sync success rate
- ✅ Zero data loss
- ✅ <2s sync time on 3G network

### Full Launch (Phase 5)
- ✅ All modules work offline
- ✅ 99.9%+ sync success rate
- ✅ Works on 2G networks
- ✅ Conflict resolution transparent to user
- ✅ <500 MB local storage per device

---

## Critical Dependencies

**Must Exist Before Starting Phase 1**:
- ✅ sync_outbox table (already exists in schema)
- ✅ sync_status field (already exists on transactional tables)
- ✅ device_id tracking (already exists)
- ✅ audit_log (already exists)

**Must Exist For Phase 0 to Complete**:
- Sync server routes
- Sync client library
- Conflict resolution logic
- Local SQLite schema

---

## Team Structure Recommendation

| Role | Weeks | Tasks |
|------|-------|-------|
| **Lead** | 0-20 | Architecture, design decisions, integration |
| **Backend Dev 1** | 0-20 | Sync routes, conflict resolution, testing |
| **Backend Dev 2** | 2-20 | Local DB migrations, data validation |
| **Frontend Dev 1** | 4-20 | Sync store, hooks, POS screen, UI |
| **Frontend Dev 2** | 6-20 | Master data sync, image caching, reports |
| **QA** | 4-20 | Test automation, E2E tests, staging validation |

---

## Questions to Resolve

Before starting Phase 0:

1. **Local DB choice**: better-sqlite3 for desktop only, or also for web (sql.js)?
2. **Image caching**: Download full-res images locally, or lazy-load?
3. **Conflict UI**: Show all conflicts at once, or one at a time?
4. **Bootstrap strategy**: Sync all master data on login, or lazy-load per screen?
5. **Storage quota**: Max ~500 MB per device, or higher?
6. **Sync frequency**: Every 30s, 60s, or on-demand only?
7. **Rollout**: Gradual (5% per week) or all-at-once after testing?

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Stock corruption** | ❌ Business loss | Append-only ledger + triggers + daily audit |
| **Invoice number conflicts** | 🟡 Manual resolution needed | Renumbering logic + audit trail |
| **Offline device sync storm** | ❌ Server overload | Rate limiting + batching + exponential backoff |
| **Large local DB** | 🟡 Storage issues | Aggressive indexing + pruning + lazy-loading |
| **Slow merge on sync** | 🟡 User waits | Background sync + notifications |

---

## Resources

- 📖 Full Implementation Plan: `OFFLINE_SYNC_IMPLEMENTATION_PLAN.md`
- 📊 Codebase Analysis: (available on request)
- 📝 CLAUDE.md Sections: 1.12 (offline-first), 9 (sync), 1.4 (transactions)
- 🧪 Test Examples: (Phase 0-5 test specs in plan)

---

**Ready to Begin?**

1. ✅ Schedule architecture review meeting
2. ✅ Assign team leads
3. ✅ Set up project management (GitHub Projects)
4. ✅ Create Phase 0 epics & issues
5. ✅ Begin development

**Timeline**: Phase 1 (POS offline) can ship in ~7 weeks with dedicated 2-3 person team.

---

Last Updated: 2026-07-30  
Status: Ready for Implementation  
Questions? See Full Plan or reach out.
