"""MediSync FastAPI application entry point."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware import Auth0Middleware
from api.routes.chat import router as chat_router
from api.routes.health import router as health_router
from api.routes.appointments import router as appointments_router
from api.routes.diagnostics import router as diagnostics_router
from api.routes.sessions import router as sessions_router
from api.routes.payroll import router as payroll_router
from api.routes.billing import router as billing_router
from api.routes.knowledge import router as knowledge_router
from api.routes.alerts import router as alerts_router
from config.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up db pools on startup
    try:
        from db.redis_client import get_redis_pool
        get_redis_pool()
    except Exception:
        pass
    yield


app = FastAPI(title="MediSync AI API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(Auth0Middleware)

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(sessions_router)
app.include_router(appointments_router)
app.include_router(diagnostics_router)
app.include_router(payroll_router)
app.include_router(billing_router)
app.include_router(knowledge_router)
app.include_router(alerts_router)


@app.get("/")
async def root():
    return {"service": "MediSync AI API", "status": "running"}
