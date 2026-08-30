from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.v1.router import api_router
from backend.app.core.config import settings
from backend.app.core.logging import logger, setup_logging
from backend.app.database.session import check_database_connection, init_db_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")

    # Verify DB connectivity & initialize development schema if needed
    db_connected, db_info, latency = await check_database_connection()
    if db_connected:
        logger.info(f"Connected to database ({db_info}) in {latency}ms")
        try:
            await init_db_schema()
        except Exception as e:
            logger.warning(f"Auto-schema init skipped or deferred: {e}")
    else:
        logger.warning(f"Database connection offline at startup: {db_info}")

    yield

    # Shutdown
    logger.info("Application shutting down...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# Configure CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs_url": f"{settings.API_V1_STR}/docs",
        "health_url": f"{settings.API_V1_STR}/health",
    }


@app.get("/health", tags=["Root"])
async def root_health():
    """Top-level health check endpoint redirecting to v1 health logic."""
    db_connected, db_info, latency_ms = await check_database_connection()
    return {
        "status": "healthy" if db_connected else "degraded",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": {
            "status": "connected" if db_connected else "disconnected",
            "type": db_info,
            "latency_ms": latency_ms,
        },
    }

