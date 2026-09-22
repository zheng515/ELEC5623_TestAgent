from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import Settings
from app.core.database import Store
from app.services.orchestrator import AnalysisOrchestrator, Orchestrator


def create_app(
    settings: Settings | None = None,
    orchestrator: Orchestrator | None = None,
) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.database_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.initialize()
        app.state.store = store
        app.state.orchestrator = orchestrator or AnalysisOrchestrator()
        yield

    app = FastAPI(
        title="ReqTest API",
        description="Requirement-aware analysis API. Agent execution is not connected.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)
    return app


app = create_app()
