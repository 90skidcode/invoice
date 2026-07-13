# Counter — Local-First Billing & Inventory for Indian SMBs

A multi-device, offline-capable billing and inventory platform built for Indian retail shops, workshops, and small manufacturers.

**Features:**
- 💻 Works fully offline — sync when you're online
- 📱 Desktop, mobile, and web — same app, any device
- 🧾 Invoicing with GST calculation and thermal printing
- 📊 Inventory tracking with running balance
- 💰 Multi-currency support with precise decimal arithmetic
- 🔒 End-to-end encryption, multi-tenant, role-based access
- 📈 Reports, analytics, and historical ledgers

---

## Prerequisites

Before you start, ensure you have:

- **Node.js** v22 LTS or higher ([download](https://nodejs.org/))
- **pnpm** v9+ ([install guide](https://pnpm.io/installation))
- **PostgreSQL** 16 (local or Supabase)
- **Redis** 7+ (for background jobs)

### Verify Installation

```bash
node --version   # should be v22.x.x
pnpm --version   # should be v9.x.x or higher
```

---

## Quick Start (5 minutes)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd counter
pnpm install
```

> **Note:** If you see `[ERR_PNPM_IGNORED_BUILDS]` — don't worry, it's already fixed in `pnpm-workspace.yaml`. This allows pnpm to build native dependencies (biome, argon2, esbuild) which are required for the project.

### 2. Set Up Environment

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your configuration:
# - DATABASE_URL: PostgreSQL connection string
# - JWT keys (run the command in the file to generate)
# - REDIS_URL: local Redis or cloud instance
# - Other settings (see below)
```

### 3. Generate JWT Keys

```bash
node -e "const{generateKeyPairSync}=require('crypto');const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log('JWT_PRIVATE_KEY_B64='+Buffer.from(privateKey).toString('base64'));console.log('JWT_PUBLIC_KEY_B64='+Buffer.from(publicKey).toString('base64'))"
```

Paste the output into `.env.local`.

### 4. Set Up Database

```bash
# Run migrations
pnpm db:migrate:up

# Verify connection (should complete without errors)
```

### 5. Start the App

```bash
# Terminal 1 — start all services in parallel
pnpm dev

# This starts:
# - apps/api (Fastify) on http://localhost:3001
# - apps/web (React) on http://localhost:5173
```

Visit **http://localhost:5173** in your browser. You should see the login page.

---

## Environment Configuration

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@localhost/counter` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_PRIVATE_KEY_B64` | JWT signing (base64-encoded RSA private key) | (see generation above) |
| `JWT_PUBLIC_KEY_B64` | JWT verification (base64-encoded RSA public key) | (see generation above) |

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Set to `production` for production builds |
| `PORT` | `3001` | API server port |
| `HOST` | `0.0.0.0` | API server host |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL for CORS |
| `VITE_API_URL` | (empty) | Frontend API URL (for production builds) |
| `VITE_ORG_CODE` | (auto-detect) | Default org code on login |

### Setting Up PostgreSQL

#### Option A: Local PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16
createdb counter

# Then set DATABASE_URL in .env.local
DATABASE_URL=postgresql://localhost/counter
```

#### Option B: Supabase (Recommended for Production)

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy the **Session pooler** connection string
3. Paste into `.env.local`:
   ```
   DATABASE_URL=postgresql://postgres.<PROJECT_ID>:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

### Setting Up Redis

#### Option A: Local Redis

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Then set REDIS_URL in .env.local
REDIS_URL=redis://localhost:6379
```

#### Option B: Cloud Redis (e.g., Redis Cloud)

1. Create a free database at [redis.com/cloud](https://redis.com/try-free/)
2. Copy the connection URL
3. Paste into `.env.local`:
   ```
   REDIS_URL=redis://default:<PASSWORD>@<HOST>:<PORT>
   ```

---

## Project Structure

```
counter/
├── apps/
│   ├── api/              # Fastify backend (Node.js)
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints (/v1/...)
│   │   │   ├── services/ # Business logic
│   │   │   └── db/       # Repository layer
│   │   └── package.json
│   │
│   └── web/              # React frontend (Vite)
│       ├── src/
│       │   ├── pages/    # React page components
│       │   ├── components/ # Reusable components
│       │   └── hooks/    # Custom React hooks
│       └── package.json
│
├── packages/
│   ├── ui/               # Component library + form renderer
│   ├── schemas/          # Shared Zod schemas (client + server)
│   ├── db/               # Drizzle ORM schemas + migrations
│   ├── sync/             # Offline sync protocol
│   ├── printer/          # Invoice printing (ESC/POS + HTML)
│   ├── tax/              # GST calculation
│   ├── i18n/             # Translations
│   └── utils/            # Pure utilities (money, dates, IDs)
│
├── docs/                 # Specification docs (BRD, API, schemas)
├── tests/                # E2E tests (Playwright)
├── scripts/              # Build & migration helpers
│
├── CLAUDE.md             # Project rules & guidelines (READ THIS)
├── .env.example          # Environment template
├── package.json          # Root workspace config
└── pnpm-workspace.yaml   # Monorepo configuration
```

**Key Rules:**
- `packages/utils` is pure — no internal dependencies
- `packages/db` is server-only — never import in frontend
- Shared schemas & UI go in packages, never duplicated

---

## Common Commands

### Development

```bash
# Start all apps in dev mode (hot reload)
pnpm dev

# Run type checking across all apps
pnpm typecheck

# Run tests
pnpm test

# Run tests with watch
pnpm test -- --watch

# Run linting (ESLint + Biome)
pnpm lint

# Auto-fix linting issues
pnpm format
```

### Database

```bash
# Create a new migration
pnpm db:migrate:create my_feature_name
# Then edit the generated file in packages/db/migrations/

# Run pending migrations
pnpm db:migrate:up

# Verify migrations ran
pnpm db:migrate:status
```

### Building

```bash
# Build all apps & packages
pnpm build

# Build just the API
pnpm --filter @counter/api build

# Build just the web app
pnpm --filter @counter/web build
```

---

## Running Specific Apps

### API Server

```bash
# Terminal 1: Start the API
pnpm --filter @counter/api dev
# Runs on http://localhost:3001
# API docs: http://localhost:3001/docs
```

### Web App (React)

```bash
# Terminal 2: Start the frontend
pnpm --filter @counter/web dev
# Runs on http://localhost:5173
```

### Both Together

```bash
pnpm dev
# Starts all apps in parallel
```

---

## Development Workflow

### Before Starting Work

1. **Read CLAUDE.md** — it's the contract for this codebase
   - Sacred rules (money, stock, transactions, audit logs)
   - Architecture patterns
   - Common mistakes to avoid

2. **Understand the spec**
   - `docs/Counter_BRD_FSD.md` — business requirements & schema
   - `docs/Counter_API_Spec.md` — REST + WebSocket API
   - `docs/Counter_UI_System.md` — component system & forms

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Write/modify code** following [CLAUDE.md](./CLAUDE.md) rules

3. **Run tests & linting**
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

4. **Commit with conventional messages**
   ```bash
   git commit -m "feat(invoicing): add F12 hotkey for save & print"
   ```

5. **Push and open a PR**
   ```bash
   git push -u origin feat/your-feature-name
   ```

---

## Common Workflows

### Adding a New API Endpoint

1. Create the route in `apps/api/src/routes/`
2. Add Zod schema to `packages/schemas/`
3. Add business logic in `apps/api/src/services/`
4. Add repository layer if needed in `apps/api/src/db/`
5. Write tests in `apps/api/src/*.test.ts`
6. Document in `docs/Counter_API_Spec.md`

### Adding a New Database Table

1. Create a migration:
   ```bash
   pnpm db:migrate:create add_my_table
   ```
2. Edit the migration file in `packages/db/migrations/`
3. Add Drizzle schema in `packages/db/schema/`
4. Run migration: `pnpm db:migrate:up`
5. Test locally before pushing

### Adding a New UI Component

1. Add component to `packages/ui/components/`
2. Export from `packages/ui/index.ts`
3. Use in `apps/web/src/components/` or directly in pages
4. Ensure it works with shadcn/ui + Tailwind

### Adding a Form

1. Don't write React code — use JSON schema
2. Add schema to `packages/ui/schemas/`
3. Use `<FormRenderer formId="..." />` in your page
4. See `docs/Counter_UI_System.md` Part B for schema syntax

---

## Testing

### Unit & Integration Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (re-run on file change)
pnpm test -- --watch

# Run tests for a specific package
pnpm --filter @counter/api test

# Run tests matching a pattern
pnpm test -- --grep "invoice"
```

### E2E Tests (Playwright)

```bash
# Run E2E tests (requires apps running)
pnpm --filter @counter/tests e2e

# Run in headed mode (see the browser)
pnpm --filter @counter/tests e2e --headed

# Debug a specific test
pnpm --filter @counter/tests e2e --debug invoice.spec.ts
```

### What Must Have Tests

- Tax calculations (GST, composition, rate changes)
- Money arithmetic (decimal.js usage)
- Business rules (period lock, credit limits, stock)
- API endpoints (at minimum: 200, 400, 403, 404, 409)
- Sync conflict scenarios

---

## Troubleshooting

### "Cannot find module" errors

```bash
# Reinstall dependencies
pnpm install

# Clean lockfile and reinstall (if above doesn't work)
rm pnpm-lock.yaml
pnpm install
```

### Database connection fails

```bash
# Check PostgreSQL is running
psql -U postgres -d counter -c "SELECT 1"

# Verify DATABASE_URL in .env.local is correct
# Format: postgresql://user:password@host:port/database

# For Supabase, use the Session pooler URL (port 5432)
```

### Redis connection fails

```bash
# Check Redis is running
redis-cli ping
# Should return "PONG"

# Verify REDIS_URL in .env.local is correct
# Local: redis://localhost:6379
# Cloud: redis://default:password@host:port
```

### Migration fails

```bash
# Check migration status
pnpm db:migrate:status

# View recent migrations
ls packages/db/migrations/ | tail -5

# Check for syntax errors in your migration file
```

### Type errors after changes

```bash
# Run type checking
pnpm typecheck

# Check specific package
pnpm --filter @counter/api typecheck
```

### Port already in use

```bash
# Find what's using port 3001 (API)
lsof -i :3001

# Find what's using port 5173 (web)
lsof -i :5173

# Kill the process
kill -9 <PID>
```

---

## Deployment

### Building for Production

```bash
pnpm build

# Outputs:
# - apps/api/dist/
# - apps/web/dist/
```

### Environment for Production

Update `.env.local` or deployment secrets:

```bash
NODE_ENV=production
VITE_API_URL=https://api.yourdomain.com/v1
# (other vars same as development)
```

### Running in Production

```bash
# API server
node apps/api/dist/index.js

# Frontend (serve the dist folder)
# Use a static host (Vercel, Netlify, Cloudflare Pages, etc.)
```

---

## Performance Targets (from BRD)

- Local operations (POS save, search): < 100 ms p95
- API operations: < 500 ms p95
- Sync round-trip: < 2 s p95
- Cold start: < 3 s on 4 GB RAM
- Report queries: < 3 s for 1-year data

Monitor these before deploying to production.

---

## Key Guidelines (Read CLAUDE.md §1)

🚫 **Sacred Rules — Never Break These:**

1. **Money is never a float** — use `decimal.js`, store as `NUMERIC(14,2)`, transport as strings
2. **Stock is never a column** — derive from `stock_ledger`, never cache on `items`
3. **Stock ledger is append-only** — INSERT only, never UPDATE/DELETE
4. **Every write is transactional** — invoices, purchases, payments are all-or-nothing
5. **Filter by `org_id` always** — every query, every INSERT
6. **Soft delete only** — set `deleted_at`, never hard DELETE
7. **Respect period locks** — check before transactional writes
8. **Audit log gets every change** — all business writes get an audit entry
9. **Tax rates are versioned** — look them up, never hardcode `* 0.18`
10. **UUID v7 for IDs** — clients generate them locally
11. **Invoice numbers are gap-free** — server-side sequences, not client invented
12. **Don't break offline** — entire app must work with no internet

See [CLAUDE.md](./CLAUDE.md) for the full contract.

---

## Stack Overview

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18 + TypeScript + Vite | Hot reload, fast builds |
| **UI Components** | shadcn/ui + Radix UI | Copy-in, we own them |
| **Styling** | Tailwind CSS | CSS variables for theming |
| **Forms** | React Hook Form + Zod | Always paired |
| **State** | TanStack Query + Zustand | Server state + UI state |
| **API** | Fastify (Node.js 22) | Fast, not Express |
| **Database** | PostgreSQL 16 | Supabase or self-hosted |
| **ORM** | Drizzle | Type-safe, not Prisma |
| **Cache/Jobs** | Redis + BullMQ | Background job queue |
| **Money Math** | decimal.js | Never floats |
| **Dates** | date-fns | Never moment.js |
| **IDs** | UUID v7 | Time-ordered, locally generated |
| **Validation** | Zod | Client + server |
| **Testing** | Vitest + Playwright | Not Jest, not Cypress |
| **Linting** | ESLint + Biome | Flat config, strict mode |

---

## Getting Help

- **Code questions:** Check [CLAUDE.md](./CLAUDE.md) first (it has the answers)
- **Spec questions:** See `docs/Counter_*.md` files
- **Bug reports:** Open an issue with reproduction steps
- **Architecture discussions:** Start a discussion in Slack/Discord

---

## License

Proprietary — Counter is not open-source. All code is confidential.

---

**Happy coding!** Counter serves real shopkeepers, mechanics, and small manufacturers. Take that responsibility seriously. When in doubt, re-read [CLAUDE.md](./CLAUDE.md) §16: "When in Doubt."
