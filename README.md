#  MediSync — Smart Hospital Management & Multi-Agent AI System

**MediSync** is a modern hospital management platform powered by a multi-agent AI backend. It gives **Doctors**, **Nurses**, **Operation Staff**, and **Admins** role-specific dashboards, automated clinical workflows, medical scan vision analysis, and smart context retrieval (RAG).

---

##  1. System Architecture (In Simple Words)

MediSync is built from three main layers that talk to each other seamlessly:

```
                                  USER INTERFACE (Next.js 14)
                   +---------------------------------------------------------+
                   |  Doctor  |  Nurse  |  Operations  |  Admin   |
                   +---------------------------------------------------------+
                                                |
                                                v (REST / SSE Stream / Auth0 JWT)
                                     FASTAPI AI BACKEND
                   +---------------------------------------------------------+
                   |  Auth0 Role Guard (Doctor / Nurse / Admin Check)    |
                   |  Supervisor Agent (LangGraph Intent Router)         |
                   +---------------------------------------------------------+
                                                |
            +------------------+----------------+------------------+------------------+
            |                  |                |                  |                  |
            v                  v                v                  v                  v
     Clinical Agent   Diagnostics    Scheduling      Inventory       Staff/HR
     • Patient Vitals   • Vision Model     • Appointments     • Stock Tracking   • Shifts / Roster
     • Medical History  • Scan OCR (HUD)   • Conflict Check   • Bed/Room Booking • Stripe Payroll
     • Prescriptions    • ICD-10 Coding    • Email Reminders  • Low-Stock Alerts • Hospital Reports
            |                  |                |                  |                  |
            +------------------+----------------+------------------+------------------+
                                                |
                   +---------------------------------------------------------+
                   |                   STORAGE & AI ENGINES                  |
                   +---------------------------------------------------------+
                   |  PostgreSQL (Supabase) : Patients, Reports, Billing  |
                   |  ChromaDB              : RAG Clinical Search + Mem0  |
                   |  Redis & Celery        : Automated 1-Day Reminders   |
                   |  Multi-Provider Vision : Gemini 3.7 / OpenRouter     |
                   |  Resend & Google API   : Emails & Google Calendar    |
                   +---------------------------------------------------------+
```

### How the Parts Work Together:
1. **Frontend (`application/`)**: Built with Next.js 14, React, and TailwindCSS. It provides real-time role-based navigation, patient profiles, scheduling calendar, diagnostic AI assistant, and billing dashboards.
2. **AI Engine (`AI/`)**: Built with FastAPI and LangGraph. When a user asks a question, the **Supervisor Agent** inspects the intent and routes the query to the correct specialist agent (Clinical, Diagnostics, Scheduling, Inventory, or Staff HR).
3. **Multi-Provider Vision**: When a medical image (Ultrasound, X-ray, CT, MRI, Dermatology) is uploaded, it runs through **Google Gemini 3.7 / OpenRouter / Groq** with automated fallbacks to extract findings, severity, and ICD-10 codes.
4. **RAG & Memory**: Uses **ChromaDB** to index clinical documents and doctor consultation history, allowing the AI to pull relevant patient history without hallucinations.

---

##  2. Role-Based Features

| Role | What They Can Do |
| :--- | :--- |
| **Clinical Staff / Nurses** | Patient admissions, vitals recording, medical history review, AI scan analysis, and automated report emailing. |
| **Doctors** | Detailed patient care, allergy/drug safety checks, prescription management, diagnostic scan interpretation, and customized treatment planning. |
| **Operation Staff** | Appointment scheduling with automated conflict resolution, 1-day pre-appointment email reminders, patient billing/invoicing, bed/room/theatre booking, inventory stock alerts, and queue tracking. |
| **Hospital Admin** | Role-based permission management, hospital-wide KPI reports, staff roster & shift gap tracking, and Stripe staff payroll processing. |

---

##  3. Prerequisites

Before installing, make sure you have the following installed on your machine:
* **Node.js**: Version 20 or higher (`node -v`)
* **Python**: Version 3.12 or higher (`python3 --version`)
* **Docker & Docker Compose**: For local PostgreSQL, Redis, and ChromaDB (`docker compose version`)
* **Git**: For cloning the repository

---

##  4. Step-by-Step Installation & Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/Zeddli/medfyp.git
cd medfyp
```

---

### Step 2: Start Background Infrastructure (Docker)
Start the local PostgreSQL, Redis, and ChromaDB containers:

```bash
docker compose up -d
```

*Verify the services are running:*
* **PostgreSQL Database**: `localhost:5433`
* **Redis Cache & Broker**: `localhost:6379`
* **ChromaDB Vector Store**: `localhost:8001`

*(Optional) Seed local Postgres database with demo records:*
```bash
for f in supabase/migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d medisync -f "$f"
done
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d medisync -f supabase/seed.sql
```

---

### Step 3: Configure the AI Backend (`AI/`)

1. Open the `AI` directory and create your virtual environment:
   ```bash
   cd AI
   python3 -m venv .venv
   source .venv/bin/activate    # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Configure environment variables in `AI/.env`:
   ```bash
   cp .env.example .env
   ```

3. Open `AI/.env` and ensure your AI keys are set:
   ```env
   # Core Connections
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/medisync
   REDIS_URL=redis://localhost:6379/0
   CHROMA_HOST=localhost
   CHROMA_PORT=8001
   APP_ORIGIN=http://localhost:3000

   # Auth0 (Match your Auth0 application)
   AUTH0_DOMAIN=your-tenant.us.auth0.com
   AUTH0_AUDIENCE=http://localhost:8000

   # AI Vision & LLM Providers (Add at least ONE working key)
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_VISION_MODEL=gemini-3.6-flash
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_VISION_MODEL=google/gemini-3.7-flash
   GROQ_API_KEY=your_groq_api_key_here
   VISION_PROVIDER=auto

   # Optional External Integrations
   RESEND_API_KEY=your_resend_email_api_key
   STRIPE_SECRET_KEY=sk_test_your_stripe_key
   ```

---

### Step 4: Configure the Frontend App (`application/`)

1. Open the `application` folder and install dependencies:
   ```bash
   cd ../application
   npm install
   ```

2. Create `application/.env.local`:
   ```env
   # Auth0 Settings
   AUTH0_DOMAIN=your-tenant.us.auth0.com
   AUTH0_CLIENT_ID=your-client-id
   AUTH0_CLIENT_SECRET=your-client-secret
   AUTH0_SECRET=use-a-32-byte-random-string
   APP_BASE_URL=http://localhost:3000
   AUTH0_AUDIENCE=http://localhost:8000

   # Supabase Database
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-supabase-key
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-key

   # AI Backend URL
   NEXT_PUBLIC_AI_API_URL=http://localhost:8000
   ```

---

### Step 5: Run the Full System

Open two terminal tabs:

**Terminal 1 — Run AI Backend:**
```bash
cd AI
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*(Backend documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs))*

**Terminal 2 — Run Frontend Web App:**
```bash
cd application
npm run dev
```
*(Open your browser at [http://localhost:3000](http://localhost:3000))*

---

##  5. Testing & Verification

### 1. Test AI Vision (Medical Scan Analysis)
1. Log in to the web app as a **Doctor** or **Clinical Staff**.
2. Navigate to **Diagnostics** or **Diagnostic AI Assistant**.
3. Upload an ultrasound, X-ray, or CT image and click **Analyze Scan with AI**.
4. The system will return anatomical structures, findings, severity badges, and ICD-10 differential diagnoses.

### 2. Test RAG (Knowledge Base Retrieval)
1. In the AI chat assistant, ask:
   > *"What were the latest diagnostic findings and medications for patient PT-1001?"*
2. The AI uses `retrieve_clinical_context` to query ChromaDB and answers with real clinical evidence.

### 3. Sync Database Records into RAG
To sync newly added patient records from Postgres into ChromaDB:
```bash
cd AI
.venv/bin/python -m tools.ingest_clinical
```

---

##  6. Repository Folder Structure

```
medfyp/
├── application/                # Next.js 14 Web Application
│   ├── app/                    # App Router pages (patients, diagnostics, staff, billing)
│   ├── components/             # React UI components & AI assistant panels
│   └── lib/                    # Auth0, Supabase actions, API clients
├── AI/                         # FastAPI & LangGraph AI Backend
│   ├── agents/                 # Specialized role-based AI agents
│   ├── api/routes/             # Endpoints (chat, diagnostics, knowledge, payroll)
│   ├── config/                 # LLM, vision provider, and system settings
│   ├── db/                     # Postgres, Redis, ChromaDB connectors
│   ├── graph/                  # LangGraph Supervisor orchestration router
│   ├── memory/                 # Mem0 long-term memory engine
│   └── tools/                  # 20+ specialized clinical & operational tools
├── documentation/              # Setup guides and demo walkthroughs
└── supabase/                   # SQL migrations and database seed files
```

---

