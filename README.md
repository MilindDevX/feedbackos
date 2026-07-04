# FeedbackOS — Customer Feedback Triage with AI Tagging

> **Eliminate 5–10 hours/week of manual PM tagging work.** FeedbackOS ingests customer feedback from Zendesk, Intercom, CSV uploads, and manual entry — automatically classifying each item by theme, sentiment, and product area using LLM structured outputs — and surfaces trends on a real-time analytics dashboard.

---

## 🚀 Live Demo

**Demo URL:** [https://feedbackos.vercel.app](https://feedbackos.vercel.app)
**Demo Login:** `demo@feedbackos.app` (email magic link — no Google account required)

The demo ships with **48 pre-classified feedback items** across all 7 themes and 4 sentiment categories, ready to explore.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js 14 App                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth Layer  │  │  API Routes  │  │  Frontend (React)    │  │
│  │  NextAuth v5 │  │  /api/...    │  │  Dashboard, Table,   │  │
│  │  Google/Email│  │  Zod Validated│ │  Slide-over, Charts  │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │ enqueue
              ┌───────────────▼───────────────┐
              │        BullMQ + Redis          │
              │  classify-feedback queue       │
              │  zendesk-sync queue            │
              │  csv-import queue              │
              └───────────────┬───────────────┘
                              │ process
              ┌───────────────▼───────────────┐
              │    Background Worker Process   │
              │  jobs/worker.ts               │
              │  ┌─────────────────────────┐  │
              │  │  classifyFeedback()     │  │
              │  │  llama-3.3-70b-versatile   │  │
              │  │  via Groq API           │  │
              │  └─────────────────────────┘  │
              └───────────────┬───────────────┘
                              │ persist
              ┌───────────────▼───────────────┐
              │        PostgreSQL DB           │
              │  (Prisma ORM, Redis cache)     │
              └───────────────────────────────┘
```

**Key design decisions:**
- **Two-process architecture:** Next.js (HTTP) and BullMQ Worker run as separate processes so AI classification never blocks API response times.
- **Groq for AI:** Routes through Groq to `llama-3.3-70b-versatile` for ultra-low latency inference.
- **Redis caching:** Dashboard summary cached for 5 minutes, protecting Postgres from repeated aggregation queries.
- **AES-256-GCM encryption:** All integration credentials (Zendesk API tokens) are encrypted at rest before storage.

---

## 📊 How It Works — Real Example

**Input:** Raw customer feedback
```
"The new dashboard is incredibly slow when I try to load more than 50 feedback 
items. I have to wait 10 seconds for it to render. Please fix this."
```

**Output:** Structured classification (persisted to DB in ~1.2s)
```json
{
  "theme": "PERFORMANCE",
  "sentiment": "NEGATIVE",
  "product_area": "Dashboard",
  "confidence": 0.94,
  "summary": "Dashboard renders slowly with 50+ feedback items loaded",
  "requires_human_review": false
}
```

The classified item immediately appears in the feedback table with the correct badge, and updates the dashboard trend charts.

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (local or cloud)
- Redis 6+ (local or Upstash)
- Groq API key (free at [groq.com](https://groq.com))

### 1. Clone and install
```bash
git clone <repo-url>
cd feedbackos
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env` and fill in:
| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Local Postgres or Neon/Supabase free tier |
| `REDIS_URL` | Local Redis or Upstash free tier (`rediss://` in prod) |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |

### 3. Initialize database & seed demo data
```bash
npm run db:migrate   # Apply schema migrations
npm run db:seed      # Load 48 realistic demo feedback items
```

### 4. Start the application
```bash
npm run dev
```

This starts **two processes simultaneously**:
- **Next.js dev server** on `http://localhost:3000` (cyan logs)
- **BullMQ background worker** (yellow logs)

### 5. Log in
Open `http://localhost:3000` and sign in with:
- **Email:** `demo@feedbackos.app`
- Click the magic link in your email (or check server logs in dev)

---

## 🔌 Integrations

### Zendesk
Go to **Settings → Integrations → Zendesk**, enter your subdomain, admin email, and API token. Click **Sync Now** to import tickets.

### Intercom (Webhook)
Go to **Settings → Integrations → Intercom**. Copy the webhook URL and paste it into your Intercom developer dashboard under **Settings → Webhooks**. Subscribe to `conversation.created` and `conversation.replied` events.

### CSV Upload
Go to **Ingest → Upload CSV**. Drag and drop any CSV up to 5MB with up to 500 rows. The system auto-detects column names and lets you map them to the correct fields.

---

## 🧪 Testing

```bash
# Run all unit tests
npm run test:unit

# Run E2E tests (requires app to be running)
npm run test:e2e
```

---

## 🚀 Deployment (Vercel & Render)

**Frontend & API (Vercel)**
Deploy the repository directly to Vercel. Ensure all environment variables are set in your Vercel project settings.

**Background Worker (Render)**
Set the **build command** to:
```bash
npm run deploy:build
```

This runs `prisma generate && prisma migrate deploy && next build` — ensuring the DB is always migrated before the app starts.

Start the **worker** as a separate service with:
```bash
npm run worker
```

> **Important:** Use `rediss://` (TLS) for your `REDIS_URL` in production. The app automatically enables TLS when the URL uses the `rediss://` scheme.
