import ssl as _ssl

import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from config.settings import settings

# Supabase (direct or pooler) requires SSL; the local Docker Postgres does not.
# SSL is enabled only when the DSN points at supabase.co so the same code path
# works against either target.
_IS_SUPABASE = ("supabase.co" in settings.database_url
                or "supabase.com" in settings.database_url)


def _ssl_context():
    if not _IS_SUPABASE:
        return None
    ctx = _ssl.create_default_context()
    # Require encryption but skip cert verification (equivalent to sslmode=require):
    # Supabase's direct/pooler certs are not always in the host trust store.
    ctx.check_hostname = False
    ctx.verify_mode = _ssl.CERT_NONE
    return ctx


# NullPool: each session opens a fresh connection bound to the current event loop
# and closes it on return. Required because Celery/autonomous runs execute each
# DB operation via asyncio.run() (a fresh short-lived loop); a pooled connection
# would remain bound to a dead loop and fail with "Event loop is closed" /
# "Future attached to a different loop" on the next call.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args={"ssl": _ssl_context()} if _IS_SUPABASE else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# Plain postgresql:// DSN for raw asyncpg.connect() calls — asyncpg rejects the
# +asyncpg dialect prefix that SQLAlchemy requires.
_APG_DSN = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")


async def apg_connect() -> asyncpg.Connection:
    """Open a raw asyncpg connection with SSL configured for Supabase."""
    return await asyncpg.connect(_APG_DSN, ssl=_ssl_context())


async def get_engine():
    return engine


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
