import uuid, re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User, Tenant, TenantMember, RoleEnum
from app.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut, UpdateProfileRequest, AvatarUploadRequest, AvatarUrlUpdate
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.services.aws import generate_presigned_put, get_public_url

router = APIRouter(prefix="/auth", tags=["auth"])


def _make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:50]


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)

    base_slug = _make_slug(req.workspace_name)
    slug = base_slug
    counter = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(id=uuid.uuid4(), name=req.workspace_name, slug=slug)
    db.add(tenant)

    membership = TenantMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_id=user.id,
        role=RoleEnum.owner,
    )
    db.add(membership)
    db.commit()

    token = create_access_token({"sub": str(user.id), "tenant_id": str(tenant.id)})
    return TokenResponse(access_token=token, user_id=str(user.id), tenant_id=str(tenant.id))


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email, User.is_active == True).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    membership = db.query(TenantMember).filter(TenantMember.user_id == user.id).first()
    if not membership:
        raise HTTPException(status_code=400, detail="No workspace found for this user")

    token = create_access_token({"sub": str(user.id), "tenant_id": str(membership.tenant_id)})
    return TokenResponse(access_token=token, user_id=str(user.id), tenant_id=str(membership.tenant_id))


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if req.full_name is not None:
        current_user.full_name = req.full_name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/avatar/presign")
def get_avatar_upload_url(
    req: AvatarUploadRequest,
    current_user=Depends(get_current_user),
):
    ext = req.content_type.split("/")[-1]
    key = f"profiles/{current_user.id}/avatar.{ext}"
    upload_url = generate_presigned_put(key, req.content_type)
    public_url = get_public_url(key)
    return {"upload_url": upload_url, "public_url": public_url, "s3_key": key}


@router.patch("/me/avatar", response_model=UserOut)
def update_avatar_url(
    req: AvatarUrlUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    current_user.profile_picture_url = req.url
    db.commit()
    db.refresh(current_user)
    return current_user
