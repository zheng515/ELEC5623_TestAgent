from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
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
        app.state.settings = settings
        app.state.orchestrator = orchestrator or _default_orchestrator(settings)
        app.state.mode = getattr(app.state.orchestrator, "mode", "scaffold")
        app.state.execution_ready = getattr(app.state.orchestrator, "executes_tests", False)
        app.state.inspection_ready = getattr(app.state.orchestrator, "inspects_repositories", False)
        app.state.diagnosis_ready = app.state.mode == "baseline_b2"
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
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        if not request.url.path.startswith("/api/v1/auth/"):
            return await request_validation_exception_handler(request, error)
        # Pydantic's default errors include raw inputs, including submitted passwords.
        details = [
            {"loc": item["loc"], "msg": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": details})

    @app.middleware("http")
    async def session_safety(request: Request, call_next):
        if request.url.path.startswith("/api/v1"):
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                trusted = {*settings.cors_origins, str(request.base_url).rstrip("/")}
                if origin and origin not in trusted:
                    return JSONResponse(status_code=403, content={"detail": "Origin not allowed."})
                # Requiring JSON prevents simple cross-site form requests, even without Origin.
                if (
                    request.headers.get("content-type", "").split(";")[0].strip()
                    != "application/json"
                ):
                    return JSONResponse(
                        status_code=415, content={"detail": "Use application/json."}
                    )
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"
            return response
        return await call_next(request)

    app.include_router(auth_router)
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
    return DirectLLMOrchestrator(llm, runner=create_runner(settings), settings=settings)


app = create_app()
