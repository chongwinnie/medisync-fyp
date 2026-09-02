# MediSync — Setup

Local setup for the Next.js app (`application/`) and AI backend (`AI/`). Requires **Node 20+**, **Python 3.12+**, and **Docker**.

---

## 1. Infrastructure

From the repo root:

```bash
docker compose up -d
```

| Service  | Host              | Purpose        |
| -------- | ----------------- | -------------- |
| Postgres | `localhost:5433`  | App + AI DB    |
| Redis    | `localhost:6379`  | Sessions/Celery|
| Chroma   | `localhost:8001`  | Vectors/Mem0   |

Apply schema (local Docker Postgres):

```bash
for f in supabase/migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d medisync -f "$f"
done

# Optional demo data
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d medisync -f supabase/seed.sql
```

Or for a linked hosted Supabase project: `npx supabase db push`.

---

## 2. Auth0 (required before env)

1. Create a **Regular Web Application**. Callbacks:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Allowed Web Origins: `http://localhost:3000`
2. Create an **API** with identifier `http://localhost:8000` (this is `AUTH0_AUDIENCE`). Authorize the web app for that API.
3. Deploy the Post-Login Action from `application/lib/auth0/post-login-action.js` (secrets: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
4. After first login, set each user’s `users.role` in the DB (`doctor` | `nurse` | `admin`).

Generate `AUTH0_SECRET`:

```bash
openssl rand -hex 32
```

---

## 3. Application env

Create `application/.env.local` (do not commit):

```bash
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_SECRET=generate-a-long-random-string
APP_BASE_URL=http://localhost:3000
AUTH0_AUDIENCE=http://localhost:8000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

NEXT_PUBLIC_AI_API_URL=http://localhost:8000
```

| Variable | Purpose |
| -------- | ------- |
| `AUTH0_*` / `APP_BASE_URL` | Auth0 login + session |
| `AUTH0_AUDIENCE` | Must match Auth0 API identifier and AI |
| `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` | Supabase clients |
| `NEXT_PUBLIC_AI_API_URL` | FastAPI base URL |

---

## 4. AI env

```bash
cd AI
cp .env.example .env
```

Edit `AI/.env` (do not commit). Full template: [`AI/.env.example`](../AI/.env.example).

**Required / typical local values:**

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/medisync
REDIS_URL=redis://localhost:6379/0
CHROMA_HOST=localhost
CHROMA_PORT=8001
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=http://localhost:8000
OPENAI_API_KEY=sk-your-openai-key
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
PREFER_OPENAI=true
MEM0_MODE=oss
MEM0_VECTOR_PROVIDER=chroma
MEM0_COLLECTION_NAME=medisync_mem0
CELERY_BROKER_URL=redis://localhost:6379/0
APP_ORIGIN=http://localhost:3000
```

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Async Postgres (Docker uses port **5433**) |
| `REDIS_URL` / `CELERY_BROKER_URL` | Redis |
| `CHROMA_HOST` / `CHROMA_PORT` | Chroma |
| `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` | JWT validation (audience must match app) |
| `OPENAI_*` / `PREFER_OPENAI` | Primary LLM |
| `MEM0_*` | Long-term memory (`oss` = local Chroma) |
| `APP_ORIGIN` | CORS for the Next.js app |

| Variable | Purpose |
| -------- | ------- |
| `GEMINI_API_KEY` / `GEMINI_VISION_MODEL` | Google Gemini multimodal vision & LLM (`gemini-3.6-flash`) |
| `OPENROUTER_API_KEY` / `OPENROUTER_VISION_MODEL` | OpenRouter multi-model aggregator (`google/gemini-3.7-flash`) |
| `GROQ_API_KEY` / `GROQ_VISION_MODEL` | Groq high-speed cloud LLM/Vision |
| `VISION_PROVIDER` | Override vision provider (`auto` \| `gemini` \| `openrouter` \| `groq` \| `freellm` \| `openai`) |
| `FREELLMAPI_*` | LLM fallback if OpenAI key absent |
| `LANGSMITH_API_KEY` / `LANGCHAIN_PROJECT` | Tracing |
| `RESEND_API_KEY` / `RESEND_FROM` | Email fallback |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `GOOGLE_REDIRECT_URI` | Gmail + Calendar (`GOOGLE_REDIRECT_URI=http://localhost:8090/`) |
| `GOOGLE_CALENDAR_ID` / `GOOGLE_TEST_TO` | Calendar / smoke recipient |
| `STRIPE_SECRET_KEY` / `STRIPE_CURRENCY` / `STRIPE_WEBHOOK_SECRET` | Payroll demo (`sk_test_...`) |
| `MEM0_API_KEY` | Only if `MEM0_MODE=cloud` |

Google OAuth one-time (after setting client id/secret):

```bash
cd AI
.venv/bin/python scripts/google_oauth_setup.py
```

---

## 5. Run

**App**

```bash
cd application
npm install
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

**AI**

```bash
cd AI
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

→ [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

**Celery** (optional; Redis must be up)

```bash
cd AI
source .venv/bin/activate
celery -A workers.celery_app:celery_app worker --loglevel=info
# separate terminal:
celery -A workers.schedules:celery_app beat --loglevel=info
```
