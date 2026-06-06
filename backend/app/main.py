from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.db.session import init_db
from app.routers import auth, workspace, projects, misc

settings = get_settings()

app = FastAPI(
    title="SprintFlow API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS — allow requests from CloudFront domain and localhost for dev
# CORS — allow requests from CloudFront domain and localhost for dev
origins = [
    f"https://{settings.cloudfront_domain}",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SprintFlow API"}


app.include_router(auth.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(misc.router, prefix="/api")
