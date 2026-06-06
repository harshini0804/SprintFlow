import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_current_user
from app.models import Project, Task, TaskComment, ActivityLog, TaskAttachment, TaskStatusEnum, User
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut,
    TaskCreate, TaskUpdate, TaskMoveRequest, TaskOut,
    CommentCreate, CommentOut, AttachmentUploadRequest,
    AttachmentPresignedResponse, AttachmentOut, ActivityLogOut,
    TaskRefineRequest,
)
from app.services.aws import generate_presigned_put, generate_presigned_get, delete_s3_object, invoke_task_refiner
from app.services.notifications import notify_task_assigned, notify_comment_added
from app.services.limits import check_project_limit, check_attachment_limit, check_and_increment_ai_usage
from app.core.config import get_settings

router = APIRouter(tags=["projects"])
settings = get_settings()


def _tenant_id(user):
    import uuid as _uuid
    tid = user.current_tenant_id
    if isinstance(tid, str):
        try:
            return _uuid.UUID(tid)
        except ValueError:
            pass
    return tid


def _task_url(task_id: str) -> str:
    return f"https://{settings.cloudfront_domain}/tasks/{task_id}"


def _get_project(db, project_id, tenant_id):
    p = db.query(Project).filter(
        Project.id == project_id,
        Project.tenant_id == tenant_id,
        Project.is_deleted == False,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _get_task(db, task_id, tenant_id):
    import uuid as _uuid
    # Normalise tenant_id to UUID object — psycopg3 is strict about string vs UUID
    if isinstance(tenant_id, str):
        try:
            tenant_id = _uuid.UUID(tenant_id)
        except ValueError:
            pass
    t = db.query(Task).filter(Task.id == task_id, Task.tenant_id == tenant_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


def _log(db, task, user_id, action, metadata=None):
    db.add(ActivityLog(
        id=uuid.uuid4(),
        tenant_id=task.tenant_id,
        task_id=task.id,
        user_id=user_id,
        action=action,
        log_metadata=metadata,
    ))


# ── Projects ──────────────────────────────────────────────────────────────

@router.get("/projects")
def list_projects(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    projects = db.query(Project).filter(
        Project.tenant_id == _tenant_id(current_user),
        Project.is_deleted == False,
    ).all()
    result = []
    for p in projects:
        counts = {s.value: 0 for s in TaskStatusEnum}
        rows = db.query(Task.status, func.count(Task.id)).filter(
            Task.project_id == p.id
        ).group_by(Task.status).all()
        for status, cnt in rows:
            counts[status.value] = cnt
        result.append({
            "id": str(p.id), "name": p.name, "description": p.description,
            "created_at": p.created_at, "task_counts": counts,
        })
    return result


@router.post("/projects", status_code=201)
def create_project(
    req: ProjectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == _tenant_id(current_user)).first()
    limit = check_project_limit(db, tenant)
    project = Project(
        id=uuid.uuid4(),
        tenant_id=_tenant_id(current_user),
        name=req.name,
        description=req.description,
        created_by=current_user.id,
    )
    db.add(project)
    db.commit()
    return {"id": str(project.id), "name": project.name, "limit_status": limit.model_dump()}


@router.get("/projects/{project_id}")
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _get_project(db, project_id, _tenant_id(current_user))


@router.patch("/projects/{project_id}")
def update_project(
    project_id: uuid.UUID,
    req: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = _get_project(db, project_id, _tenant_id(current_user))
    if req.name:
        p.name = req.name
    if req.description is not None:
        p.description = req.description
    db.commit()
    return {"id": str(p.id), "name": p.name}


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = _get_project(db, project_id, _tenant_id(current_user))
    p.is_deleted = True
    db.commit()


# ── Tasks ─────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/tasks")
def list_tasks(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_project(db, project_id, _tenant_id(current_user))
    tasks = db.query(Task).filter(Task.project_id == project_id).order_by(
        Task.status, Task.position
    ).all()
    grouped = {s.value: [] for s in TaskStatusEnum}
    for t in tasks:
        comment_count = db.query(func.count(TaskComment.id)).filter(TaskComment.task_id == t.id).scalar()
        attachment_count = db.query(func.count(TaskAttachment.id)).filter(TaskAttachment.task_id == t.id).scalar()
        assignee_data = None
        if t.assignee:
            assignee_data = {
                "id": str(t.assignee.id),
                "full_name": t.assignee.full_name,
                "email": t.assignee.email,
                "profile_picture_url": t.assignee.profile_picture_url,
            }
        grouped[t.status.value].append({
            "id": str(t.id), "title": t.title, "description": t.description,
            "status": t.status.value, "position": t.position,
            "due_date": t.due_date, "created_at": t.created_at, "updated_at": t.updated_at,
            "assignee": assignee_data,
            "comment_count": comment_count, "attachment_count": attachment_count,
        })
    return grouped


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(
    project_id: uuid.UUID,
    req: TaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_project(db, project_id, _tenant_id(current_user))
    max_pos = db.query(func.max(Task.position)).filter(
        Task.project_id == project_id,
        Task.status == req.status,
    ).scalar() or 0
    task = Task(
        id=uuid.uuid4(),
        project_id=project_id,
        tenant_id=_tenant_id(current_user),
        title=req.title,
        description=req.description,
        status=TaskStatusEnum(req.status),
        position=max_pos + 1,
        assigned_to=req.assigned_to,
        due_date=req.due_date,
        created_by=current_user.id,
    )
    db.add(task)
    _log(db, task, current_user.id, "task_created", {"title": req.title})

    if req.assigned_to and str(req.assigned_to) != str(current_user.id):
        assignee = db.query(User).filter(User.id == req.assigned_to).first()
        if assignee:
            notify_task_assigned(db, assignee, current_user, task, _task_url(str(task.id)))

    db.commit()
    return {"id": str(task.id), "title": task.title}


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: uuid.UUID,
    req: TaskUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = _get_task(db, task_id, _tenant_id(current_user))
    old_assignee = task.assigned_to

    if req.title is not None:
        task.title = req.title
    if req.description is not None:
        task.description = req.description
    if req.due_date is not None:
        task.due_date = req.due_date
    if req.assigned_to is not None:
        task.assigned_to = req.assigned_to

    _log(db, task, current_user.id, "task_updated")

    if req.assigned_to and str(req.assigned_to) != str(old_assignee or ""):
        if str(req.assigned_to) != str(current_user.id):
            assignee = db.query(User).filter(User.id == req.assigned_to).first()
            if assignee:
                notify_task_assigned(db, assignee, current_user, task, _task_url(str(task.id)))

    db.commit()
    return {"id": str(task.id)}


@router.patch("/tasks/{task_id}/move")
def move_task(
    task_id: uuid.UUID,
    req: TaskMoveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = _get_task(db, task_id, _tenant_id(current_user))
    old_status = task.status
    new_status = TaskStatusEnum(req.status)

    # Shift existing tasks in the target column to make room
    db.query(Task).filter(
        Task.project_id == task.project_id,
        Task.status == new_status,
        Task.position >= req.position,
        Task.id != task_id,
    ).update({"position": Task.position + 1})

    task.status = new_status
    task.position = req.position
    _log(db, task, current_user.id, "task_moved", {
        "from": old_status.value, "to": new_status.value
    })
    db.commit()
    return {"id": str(task.id), "status": task.status.value, "position": task.position}


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = _get_task(db, task_id, _tenant_id(current_user))
    db.delete(task)
    db.commit()


# ── Comments ──────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/comments", status_code=201)
def add_comment(
    task_id: uuid.UUID,
    req: CommentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = _get_task(db, task_id, _tenant_id(current_user))
    comment = TaskComment(
        id=uuid.uuid4(),
        task_id=task_id,
        user_id=current_user.id,
        body=req.body,
    )
    db.add(comment)
    _log(db, task, current_user.id, "comment_added", {"preview": req.body[:100]})

    # Notify task creator and prior commenters
    notify_ids = {str(task.created_by)}
    prior = db.query(TaskComment.user_id).filter(TaskComment.task_id == task_id).all()
    for (uid,) in prior:
        notify_ids.add(str(uid))
    notify_ids.discard(str(current_user.id))

    notify_comment_added(
        db, current_user, task, req.body,
        _task_url(str(task_id)), list(notify_ids)
    )
    db.commit()
    return {"id": str(comment.id)}


@router.get("/tasks/{task_id}/comments")
def list_comments(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_task(db, task_id, _tenant_id(current_user))
    comments = db.query(TaskComment).filter(TaskComment.task_id == task_id).order_by(
        TaskComment.created_at
    ).all()
    return [
        {
            "id": str(c.id), "body": c.body, "created_at": c.created_at,
            "author": {
                "id": str(c.author.id),
                "full_name": c.author.full_name,
                "email": c.author.email,
                "profile_picture_url": c.author.profile_picture_url,
            }
        }
        for c in comments
    ]


@router.get("/tasks/{task_id}/activity")
def get_activity(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_task(db, task_id, _tenant_id(current_user))
    logs = db.query(ActivityLog).filter(ActivityLog.task_id == task_id).order_by(
        ActivityLog.created_at.desc()
    ).limit(50).all()
    return [
        {
            "id": str(l.id), "action": l.action,
            "metadata": l.log_metadata, "created_at": l.created_at,
            "actor": {
                "id": str(l.actor.id),
                "full_name": l.actor.full_name,
                "email": l.actor.email,
                "profile_picture_url": l.actor.profile_picture_url,
            }
        }
        for l in logs
    ]


# ── Attachments ───────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/attachments", response_model=AttachmentPresignedResponse, status_code=201)
def request_attachment_upload(
    task_id: uuid.UUID,
    req: AttachmentUploadRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models import Tenant
    task = _get_task(db, task_id, _tenant_id(current_user))
    tenant = db.query(Tenant).filter(Tenant.id == _tenant_id(current_user)).first()

    limit = check_attachment_limit(db, tenant, task_id)
    if limit.at_limit:
        raise HTTPException(
            status_code=402,
            detail={"message": "Attachment limit reached for free tier", "limit_status": limit.model_dump()},
        )

    s3_key = f"{task.tenant_id}/{task_id}/{req.filename}"
    upload_url = generate_presigned_put(s3_key, req.content_type)

    attachment = TaskAttachment(
        id=uuid.uuid4(),
        task_id=task_id,
        tenant_id=task.tenant_id,
        s3_key=s3_key,
        filename=req.filename,
        content_type=req.content_type,
        size_bytes=req.size_bytes,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    _log(db, task, current_user.id, "attachment_added", {"filename": req.filename})
    db.commit()

    return AttachmentPresignedResponse(
        upload_url=upload_url,
        attachment_id=attachment.id,
        s3_key=s3_key,
    )


@router.get("/tasks/{task_id}/attachments")
def list_attachments(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_task(db, task_id, _tenant_id(current_user))
    attachments = db.query(TaskAttachment).filter(TaskAttachment.task_id == task_id).all()
    return [
        {
            "id": str(a.id),
            "filename": a.filename,
            "content_type": a.content_type,
            "size_bytes": a.size_bytes,
            "created_at": a.created_at,
            "download_url": generate_presigned_get(a.s3_key),
        }
        for a in attachments
    ]


@router.delete("/tasks/{task_id}/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    task_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attachment = db.query(TaskAttachment).filter(
        TaskAttachment.id == attachment_id,
        TaskAttachment.task_id == task_id,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    delete_s3_object(attachment.s3_key)
    db.delete(attachment)
    db.commit()


# ── AI task refinement ────────────────────────────────────────────────────

@router.post("/tasks/refine")
def refine_task(
    req: TaskRefineRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == _tenant_id(current_user)).first()
    limit = check_and_increment_ai_usage(db, tenant)
    if limit.at_limit:
        return {
            "suggestions": [],
            "limit_status": limit.model_dump(),
            "message": "Monthly AI refinement limit reached. Upgrade to Pro for unlimited use.",
        }
    suggestions = invoke_task_refiner(req.prompt)
    db.commit()
    return {"suggestions": suggestions, "limit_status": limit.model_dump()}