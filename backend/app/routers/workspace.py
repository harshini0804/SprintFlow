import uuid, secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_current_user, create_access_token
from app.models import Tenant, TenantMember, Team, TeamMember, InviteToken, User, RoleEnum
from app.schemas import (
    WorkspaceOut, WorkspaceUpdate, TeamCreate, TeamOut, TeamMemberOut,
    UpdateRoleRequest, InviteEmailRequest, InviteLinkResponse,
)
from app.services.aws import publish_email_event
from app.core.config import get_settings

router = APIRouter(tags=["workspace"])
settings = get_settings()


def _require_admin(db, user_id, tenant_id):
    import uuid as _uuid
    if isinstance(tenant_id, str):
        try: tenant_id = _uuid.UUID(tenant_id)
        except ValueError: pass
    if isinstance(user_id, str):
        try: user_id = _uuid.UUID(user_id)
        except ValueError: pass
    m = db.query(TenantMember).filter(
        TenantMember.user_id == user_id,
        TenantMember.tenant_id == tenant_id,
    ).first()
    if not m or m.role not in (RoleEnum.owner, RoleEnum.admin):
        raise HTTPException(status_code=403, detail="Admin or owner role required")
    return m


# ── Workspace ──────────────────────────────────────────────────────────────

@router.get("/workspace", response_model=WorkspaceOut)
def get_workspace(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    tenant = db.query(Tenant).filter(Tenant.id == current_user.current_tenant_id).first()
    member_count = db.query(TenantMember).filter(TenantMember.tenant_id == tenant.id).count()
    out = WorkspaceOut.model_validate(tenant)
    out.member_count = member_count
    return out


@router.patch("/workspace", response_model=WorkspaceOut)
def update_workspace(
    req: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    tenant = db.query(Tenant).filter(Tenant.id == current_user.current_tenant_id).first()
    if req.name:
        tenant.name = req.name
    if req.slug:
        existing = db.query(Tenant).filter(Tenant.slug == req.slug, Tenant.id != tenant.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already taken")
        tenant.slug = req.slug
    db.commit()
    db.refresh(tenant)
    member_count = db.query(TenantMember).filter(TenantMember.tenant_id == tenant.id).count()
    out = WorkspaceOut.model_validate(tenant)
    out.member_count = member_count
    return out


# ── Teams ──────────────────────────────────────────────────────────────────

@router.get("/teams")
def list_teams(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    teams = db.query(Team).filter(Team.tenant_id == current_user.current_tenant_id).all()
    result = []
    for t in teams:
        count = db.query(TeamMember).filter(TeamMember.team_id == t.id).count()
        result.append({"id": str(t.id), "name": t.name, "created_at": t.created_at, "member_count": count})
    return result


@router.post("/teams", status_code=201)
def create_team(
    req: TeamCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    team = Team(id=uuid.uuid4(), tenant_id=current_user.current_tenant_id, name=req.name)
    db.add(team)
    member = TeamMember(id=uuid.uuid4(), team_id=team.id, user_id=current_user.id, role=RoleEnum.owner)
    db.add(member)
    db.commit()
    return {"id": str(team.id), "name": team.name}


@router.get("/teams/{team_id}/members")
def list_team_members(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    team = db.query(Team).filter(
        Team.id == team_id, Team.tenant_id == current_user.current_tenant_id
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    members = db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
    return [
        {
            "id": str(m.id),
            "user_id": str(m.user_id),
            "email": m.user.email,
            "full_name": m.user.full_name,
            "profile_picture_url": m.user.profile_picture_url,
            "role": m.role.value,
            "joined_at": m.joined_at,
        }
        for m in members
    ]


@router.patch("/teams/{team_id}/members/{user_id}")
def update_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    req: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = RoleEnum(req.role)
    db.commit()
    return {"status": "updated"}


@router.delete("/teams/{team_id}/members/{user_id}", status_code=204)
def remove_team_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()


# ── Invitations ────────────────────────────────────────────────────────────

@router.post("/teams/{team_id}/invite-email", status_code=201)
def invite_by_email(
    team_id: uuid.UUID,
    req: InviteEmailRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    team = db.query(Team).filter(
        Team.id == team_id, Team.tenant_id == current_user.current_tenant_id
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    invite_token_str = secrets.token_urlsafe(32)
    token_obj = InviteToken(
        id=uuid.uuid4(),
        team_id=team_id,
        tenant_id=current_user.current_tenant_id,
        token=invite_token_str,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(token_obj)
    db.commit()

    tenant = db.query(Tenant).filter(Tenant.id == current_user.current_tenant_id).first()
    invite_url = f"https://{settings.cloudfront_domain}/accept-invite?token={invite_token_str}"

    publish_email_event(
        event_type="invite_email",
        payload={
            "to_email": req.email,
            "inviter_name": current_user.full_name or current_user.email,
            "workspace_name": tenant.name,
            "invite_url": invite_url,
        },
    )
    return {"status": "invite sent"}


@router.post("/teams/{team_id}/invite-link", response_model=InviteLinkResponse)
def invite_by_link(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(db, current_user.id, current_user.current_tenant_id)
    team = db.query(Team).filter(
        Team.id == team_id, Team.tenant_id == current_user.current_tenant_id
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    invite_token_str = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    token_obj = InviteToken(
        id=uuid.uuid4(),
        team_id=team_id,
        tenant_id=current_user.current_tenant_id,
        token=invite_token_str,
        expires_at=expires_at,
    )
    db.add(token_obj)
    db.commit()

    invite_url = f"https://{settings.cloudfront_domain}/accept-invite?token={invite_token_str}"
    return InviteLinkResponse(invite_url=invite_url, expires_at=expires_at)


@router.post("/invites/{token}/accept")
def accept_invite(
    token: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    token_obj = db.query(InviteToken).filter(
        InviteToken.token == token,
        InviteToken.used == False,
        InviteToken.expires_at > datetime.now(timezone.utc),
    ).first()
    if not token_obj:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    # Add to tenant if not already a member
    existing = db.query(TenantMember).filter(
        TenantMember.tenant_id == token_obj.tenant_id,
        TenantMember.user_id == current_user.id,
    ).first()
    if not existing:
        db.add(TenantMember(
            id=uuid.uuid4(),
            tenant_id=token_obj.tenant_id,
            user_id=current_user.id,
            role=RoleEnum.member,
        ))

    # Add to team
    existing_team = db.query(TeamMember).filter(
        TeamMember.team_id == token_obj.team_id,
        TeamMember.user_id == current_user.id,
    ).first()
    if not existing_team:
        db.add(TeamMember(
            id=uuid.uuid4(),
            team_id=token_obj.team_id,
            user_id=current_user.id,
            role=RoleEnum.member,
        ))

    token_obj.used = True
    db.commit()
    return {"status": "joined", "tenant_id": str(token_obj.tenant_id)}