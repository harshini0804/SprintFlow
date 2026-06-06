import stripe
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_current_user
from app.models import Notification, Task, Project, Tenant, TaskStatusEnum, SubscriptionStatusEnum
from app.core.config import get_settings

router = APIRouter(tags=["notifications, analytics, billing"])
settings = get_settings()


# ── Notifications ─────────────────────────────────────────────────────────

@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).order_by(Notification.created_at.desc()).limit(20).all()
    return [
        {
            "id": str(n.id), "message": n.message,
            "is_read": n.is_read, "action_link": n.action_link,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.patch("/notifications/mark-read")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


# ── Analytics ─────────────────────────────────────────────────────────────

@router.get("/analytics/workspace")
def workspace_analytics(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tenant_id = current_user.current_tenant_id
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    is_pro = tenant.subscription_status == SubscriptionStatusEnum.active

    # Date range: 7 days for free, all time for pro
    date_filter = None
    if not is_pro:
        date_filter = datetime.now(timezone.utc) - timedelta(days=7)

    base_q = db.query(Task).filter(Task.tenant_id == tenant_id)
    if date_filter:
        base_q = base_q.filter(Task.created_at >= date_filter)

    total = base_q.count()

    status_rows = base_q.with_entities(Task.status, func.count(Task.id)).group_by(Task.status).all()
    tasks_by_status = {s.value: 0 for s in TaskStatusEnum}
    for status, cnt in status_rows:
        tasks_by_status[status.value] = cnt

    my_tasks = base_q.filter(Task.assigned_to == current_user.id).count()

    week_end = datetime.now(timezone.utc) + timedelta(days=7)
    due_this_week = db.query(Task).filter(
        Task.tenant_id == tenant_id,
        Task.due_date <= week_end,
        Task.due_date >= datetime.now(timezone.utc),
        Task.status != TaskStatusEnum.done,
    ).count()

    projects = db.query(Project).filter(
        Project.tenant_id == tenant_id,
        Project.is_deleted == False,
    ).all()
    project_stats = []
    for p in projects:
        total_p = db.query(func.count(Task.id)).filter(Task.project_id == p.id).scalar()
        done_p = db.query(func.count(Task.id)).filter(
            Task.project_id == p.id, Task.status == TaskStatusEnum.done
        ).scalar()
        pct = round((done_p / total_p * 100) if total_p > 0 else 0, 1)
        project_stats.append({"id": str(p.id), "name": p.name, "total": total_p, "done": done_p, "completion_pct": pct})

    return {
        "total_tasks": total,
        "tasks_by_status": tasks_by_status,
        "my_tasks": my_tasks,
        "due_this_week": due_this_week,
        "projects": project_stats,
        "date_range": "7 days" if not is_pro else "all time",
        "is_pro": is_pro,
    }


# ── Billing ───────────────────────────────────────────────────────────────

@router.post("/billing/checkout-session")
def create_checkout_session(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stripe.api_key = settings.stripe_secret_key
    tenant = db.query(Tenant).filter(Tenant.id == current_user.current_tenant_id).first()

    if not tenant.stripe_customer_id:
        customer = stripe.Customer.create(email=current_user.email, name=tenant.name)
        tenant.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=tenant.stripe_customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": "price_REPLACE_WITH_STRIPE_PRICE_ID", "quantity": 1}],
        success_url=f"https://{settings.cloudfront_domain}/settings/billing?success=1",
        cancel_url=f"https://{settings.cloudfront_domain}/settings/billing?canceled=1",
    )
    return {"checkout_url": session.url}


@router.get("/billing/portal-session")
def customer_portal(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stripe.api_key = settings.stripe_secret_key
    tenant = db.query(Tenant).filter(Tenant.id == current_user.current_tenant_id).first()
    if not tenant.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found")

    session = stripe.billing_portal.Session.create(
        customer=tenant.stripe_customer_id,
        return_url=f"https://{settings.cloudfront_domain}/settings/billing",
    )
    return {"portal_url": session.url}


@router.post("/billing/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    def _update_tenant_status(customer_id: str, new_status: SubscriptionStatusEnum):
        tenant = db.query(Tenant).filter(Tenant.stripe_customer_id == customer_id).first()
        if tenant:
            tenant.subscription_status = new_status
            db.commit()

    if event["type"] == "checkout.session.completed":
        _update_tenant_status(
            event["data"]["object"]["customer"],
            SubscriptionStatusEnum.active,
        )
    elif event["type"] == "invoice.payment_failed":
        _update_tenant_status(
            event["data"]["object"]["customer"],
            SubscriptionStatusEnum.past_due,
        )
    elif event["type"] == "customer.subscription.deleted":
        _update_tenant_status(
            event["data"]["object"]["customer"],
            SubscriptionStatusEnum.canceled,
        )

    return {"status": "ok"}
