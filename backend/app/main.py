from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import Settings
from app.core.database import Store
from app.services.llm import create_llm
from app.services.orchestrator import DirectLLMOrchestrator, Orchestrator, ScaffoldOrchestrator
from app.services.runner import create_runner


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
        app.state.orchestrator = orchestrator or _default_orchestrator(settings)
        app.state.mode = (
            "baseline_b0"
            if isinstance(app.state.orchestrator, DirectLLMOrchestrator)
            else "scaffold"
        )
        app.state.execution_ready = getattr(app.state.orchestrator, "executes_tests", False)
        yield

    app = FastAPI(
        title="ReqTest API",
        description=(
            "Requirement-aware verification framework. Requirements are analysed and "
            "pytest tests are generated; test execution is not connected."
        ),
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


def _default_orchestrator(settings: Settings) -> Orchestrator:
    """Run the B0 agent when credentials resolve, otherwise stay in scaffold mode.

    Falling back keeps the API and the UI usable without an API key, and keeps the
    test suite off the network.
    """
    llm = create_llm(settings)
    if llm is None:
        return ScaffoldOrchestrator()
    return DirectLLMOrchestrator(
        llm,
        runner=create_runner(settings),
        max_requirements=settings.max_requirements,
    )


app = create_app()
