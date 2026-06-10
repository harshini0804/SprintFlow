# SprintFlow

A production-grade full-stack SaaS project management app built as a campus placement portfolio piece. Features Kanban boards, multi-tenant workspaces, team collaboration, email notifications, file attachments, AI-powered task refinement, and Stripe billing — deployed on AWS using the free tier.

**Tech stack:** FastAPI · PostgreSQL · React + Vite + TypeScript · Tailwind CSS · AWS (EC2, RDS, S3, CloudFront, SNS, SQS, SES, Lambda, SSM) · Terraform · GitHub Actions CI/CD

**Live demo:** `https://dur0x8yh4xpb3.cloudfront.net`

---

## Table of Contents

1. [Architecture](#architecture)
2. [Repository Structure](#repository-structure)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Part 1 — Local Development](#part-1--local-development)
6. [Part 2 — AWS Prerequisites](#part-2--aws-prerequisites-one-time)
7. [Part 3 — Terraform Infrastructure](#part-3--terraform-infrastructure)
8. [Part 4 — EC2 First-Time Setup](#part-4--ec2-first-time-setup)
9. [Part 5 — Lambda AI Setup](#part-5--lambda-ai-setup)
10. [Part 6 — CI/CD Setup](#part-6--cicd-setup)
11. [Part 7 — Stripe Billing](#part-7--stripe-billing-optional)
12. [Daily Restart Checklist](#daily-restart-checklist)
13. [Useful Commands](#useful-commands)
14. [AWS Free Tier Cost Breakdown](#aws-free-tier-cost-breakdown)
15. [Resume Talking Points](#resume-talking-points)

---

## Architecture

```
Browser
  │
  ├── HTTPS ──► CloudFront ──────────────────► S3 (React build, private OAC)
  │                │
  └── /api/* ──────┘──► EC2 (Nginx :80)
                              └── uvicorn (FastAPI :8000)
                                        │
                            ┌───────────┼─────────────────┐
                            ▼           ▼                  ▼
                      RDS Postgres   S3 Assets         SSM Params
                      (private VPC) (pre-signed URLs)  (all secrets)
                            │
                      FastAPI ──► SNS ──► SQS
                                           │
                                    Direct SQS Worker
                                    (python -m app.worker)
                                           │
                                          SES
                                   (transactional email)
                                           
                      FastAPI ──► Lambda ──► Groq API
                                   (AI task suggestions)
                                   
All AWS credentials : EC2 IAM instance role (zero credentials stored on server)
All secrets         : SSM Parameter Store (no .env file in production)
Infrastructure      : Terraform (single terraform apply provisions everything)
CI/CD               : GitHub Actions (push to main deploys frontend + backend)
```

---

## Repository Structure

```
sprintflow/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py          Reads all secrets from SSM at startup
│   │   │   └── security.py        JWT creation and verification
│   │   ├── db/session.py          SQLAlchemy engine and session
│   │   ├── models/__init__.py     All 13 database models
│   │   ├── routers/
│   │   │   ├── auth.py            Register, login, switch-workspace, avatar
│   │   │   ├── workspace.py       Teams, members, invites, roles
│   │   │   ├── projects.py        Projects, tasks, comments, attachments
│   │   │   └── misc.py            Notifications, analytics, billing
│   │   ├── schemas/__init__.py    All Pydantic request/response models
│   │   ├── services/
│   │   │   ├── aws.py             S3, SES, SNS, Lambda boto3 wrappers
│   │   │   ├── notifications.py   Internal bell + email notification triggers
│   │   │   └── limits.py          Free/Pro tier feature gates
│   │   └── worker.py              Direct SQS poller — parses SNS envelope, sends via SES
│   ├── alembic/                   Database migrations
│   │   └── versions/0001_initial_schema.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── api/client.ts          Axios instance + all typed API methods
│       ├── hooks/useAuth.tsx       Auth context, user state, ProtectedRoute
│       ├── components/
│       │   ├── kanban/TaskDetails.tsx   Task slide-over (comments, attachments, history)
│       │   ├── layout/Navbar.tsx        Icon nav + profile dropdown
│       │   └── notifications/NotificationBell.tsx
│       └── pages/
│           ├── auth/AuthPages.tsx       Register + Login (invite auto-join)
│           ├── workspace/WorkspacePage.tsx   Project grid
│           ├── board/BoardPage.tsx      Kanban board (local state drag, no React Query)
│           ├── dashboard/DashboardPage.tsx   Analytics + charts
│           ├── settings/SettingsPage.tsx     Workspace, members, billing, profile
│           └── invite/JoinWorkspacePage.tsx  Invite accept flow
├── infra/
│   ├── main.tf                    All AWS resources (VPC, EC2, RDS, S3, CloudFront, SNS, SQS, SSM, IAM)
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── scripts/
│   ├── lambda_function.py         AI task refinement via Groq LLaMA (free tier)
│   ├── sprintflow-api.service     systemd unit for FastAPI
│   ├── sprintflow-celery.service  systemd unit for SQS worker
│   └── sprintflow.nginx.conf      Nginx reverse proxy config
├── .github/workflows/deploy.yml  Parallel frontend + backend deploy on push to main
└── docker-compose.yml             Local dev PostgreSQL only
```

---

## Features

| Feature | Implementation |
|---|---|
| Multi-tenant workspaces | Tenant isolation via `tenant_id` on every table row |
| Kanban board | `@hello-pangea/dnd` with local state (no React Query) for smooth drag |
| Task management | CRUD, comments, activity log, file attachments |
| Role-based access | owner / admin / member / viewer with backend enforcement |
| Invite system | Email invite + copy link; auto-join + workspace switch on accept |
| Email notifications | SNS → SQS → direct SQS worker → SES (invite, task assigned, comment) |
| Internal notifications | Bell icon with 30s polling, mark as read |
| File attachments | S3 pre-signed PUT (upload) + pre-signed GET (download), never through server |
| Avatar upload | S3 pre-signed PUT, pre-signed GET for display (bucket fully private) |
| AI task enhancement | Lambda → Groq LLaMA 3.1 8B (free tier, 14,400 req/day) |
| Stripe billing | Checkout session + webhook for subscription lifecycle |
| Analytics dashboard | Task completion rate, status breakdown chart, due-this-week warnings |

---

## Prerequisites

Install all of these before starting.

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org/) |
| Git | any | [git-scm.com](https://git-scm.com/) |
| Terraform CLI | 1.6+ | [developer.hashicorp.com/terraform/downloads](https://developer.hashicorp.com/terraform/downloads) |
| AWS CLI v2 | 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Docker Desktop | any | [docker.com](https://www.docker.com/products/docker-desktop/) |
| pgAdmin 4 | any | [pgadmin.org](https://www.pgadmin.org/download/) — optional, for DB inspection |

---

## Part 1 — Local Development

### 1.1 Clone the repository

```bash
git clone https://github.com/harshini0804/SprintFlow.git
cd SprintFlow
```

### 1.2 Start local PostgreSQL

```bash
docker compose up -d
# PostgreSQL on localhost:5432
# Username: postgres  Password: (blank)  DB: sprintflow
```

### 1.3 Set up the Python backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit the environment file
cp .env.example .env
```

Minimum `.env` for local dev (AWS features are skipped if values are blank):

```env
DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/sprintflow
JWT_SECRET=any-local-secret-here
CLOUDFRONT_DOMAIN=localhost:5173

# Leave these blank locally — AWS features won't work but the app runs
AWS_REGION=ap-south-1
S3_ASSETS_BUCKET=
SNS_TOPIC_ARN=
SQS_QUEUE_URL=
SES_SENDER_EMAIL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### 1.4 Run database migrations

```bash
# Inside backend/ with venv activated
alembic upgrade head
# Creates all 13 tables
```

### 1.5 Start the backend

```bash
uvicorn app.main:app --reload --port 8000
# API:    http://localhost:8000
# Docs:   http://localhost:8000/api/docs
```

### 1.6 Start the frontend

Open a new terminal in the project root:

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
# Requests to /api/ proxy to :8000 via vite.config.ts
```

### 1.7 (Optional) Run the SQS email worker locally

Email notifications require real AWS SQS. Skip this for local dev — internal bell notifications still work without it.

```bash
# Inside backend/ with venv activated
python -m app.worker
```

Local development is now complete. Open `http://localhost:5173` and register a workspace.

---

## Part 2 — AWS Prerequisites (one-time)

### 2.1 Create AWS account and configure CLI

1. Create a free-tier account at [aws.amazon.com](https://aws.amazon.com)
2. In the AWS Console → IAM → Users → Create user named `terraform-admin`
3. Attach policy `AdministratorAccess`
4. Security credentials tab → Create access key → CLI
5. Configure locally:

```bash
aws configure
# AWS Access Key ID:     AKIA...
# AWS Secret Access Key: ...
# Default region:        ap-south-1
# Default output format: json

# Verify
aws sts get-caller-identity
```

### 2.2 Create an EC2 key pair

1. AWS Console → EC2 → Key Pairs → Create key pair
2. Name: `sprintflow-key`, Type: RSA, Format: `.pem`
3. Download the `.pem` file and move it:

```bash
mkdir -p ~/.ssh
mv ~/Downloads/sprintflow-key.pem ~/.ssh/sprintflow-key.pem
chmod 400 ~/.ssh/sprintflow-key.pem

# Windows PowerShell:
# icacls "$HOME\.ssh\sprintflow-key.pem" /inheritance:r
# icacls "$HOME\.ssh\sprintflow-key.pem" /grant:r "$($env:USERNAME):(R)"
```

### 2.3 Verify SES sender email

1. AWS Console → SES → Verified identities → Create identity
2. Choose **Email address** → enter your sender email
3. Click the verification link AWS sends
4. Status changes to **Verified**

> **Note:** SES starts in sandbox mode. You can only send to verified addresses. For production (sending to anyone), go to SES → Account dashboard → Request production access. Approval typically takes 24 hours.

### 2.4 Get a Groq API key (for AI task suggestions — free)

1. Sign up at [console.groq.com](https://console.groq.com)
2. API Keys → Create API Key
3. Copy the key (starts with `gsk_...`)
4. You'll add it as a Lambda environment variable in Part 5

---

## Part 3 — Terraform Infrastructure

### 3.1 Create your tfvars file

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
aws_region       = "ap-south-1"
project_name     = "sprintflow"
ec2_key_name     = "sprintflow-key"

# Your public IP — run: curl -4 ifconfig.me
allowed_ssh_cidr = "YOUR_IP/32"

db_password  = "SecurePassword123!"   # Avoid special chars like @ or /
db_username  = "postgres"
db_name      = "sprintflow"

# Generate: python3 -c "import secrets; print(secrets.token_hex(32))"
jwt_secret   = "paste-64-char-hex-here"

ses_sender_email      = "your-verified@email.com"
stripe_secret_key     = "sk_test_placeholder"    # Update after Stripe setup
stripe_webhook_secret = "whsec_placeholder"       # Update after Stripe setup
```

### 3.2 Provision everything

```bash
terraform init
terraform plan      # Review ~42 resources
terraform apply     # Type "yes" — takes 10–15 minutes (RDS is the slow step)
```

### 3.3 Save the outputs

```
ec2_public_ip              = "13.x.x.x"
cloudfront_domain          = "https://dXXXXX.cloudfront.net"
frontend_bucket            = "sprintflow-frontend-XXXXXXXXXXXX"
cloudfront_distribution_id = "EXXXXXXXXX"
ssh_command                = "ssh -i ~/.ssh/sprintflow-key.pem ubuntu@13.x.x.x"
```

Retrieve them any time:
```bash
cd infra && terraform output
```

> **Important:** EC2 gets a new public IP every time it stops and restarts. See the [Daily Restart Checklist](#daily-restart-checklist) for how to handle this.

---

## Part 4 — EC2 First-Time Setup

Run these steps once after Terraform finishes. You will not need to repeat them.

### 4.1 Wait for bootstrap, then SSH in

```bash
# Wait ~3 minutes after terraform apply for user_data to finish
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP
```

### 4.2 Install AWS CLI

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt-get install -y unzip
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

### 4.3 Clone the repository

```bash
cd /home/ubuntu
git clone https://github.com/harshini0804/SprintFlow.git
cd SprintFlow
git config --global credential.helper store
```

> When prompted, enter your GitHub username and Personal Access Token (PAT). Generate one at GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → `repo` scope.

### 4.4 Configure Nginx and systemd services

```bash
# Copy service files
sudo cp scripts/sprintflow-api.service /etc/systemd/system/
sudo cp scripts/sprintflow-celery.service /etc/systemd/system/

# Fix the path (repo is SprintFlow with capital S and F)
sudo sed -i 's|/home/ubuntu/sprintflow|/home/ubuntu/SprintFlow|g' /etc/systemd/system/sprintflow-api.service
sudo sed -i 's|/home/ubuntu/sprintflow|/home/ubuntu/SprintFlow|g' /etc/systemd/system/sprintflow-celery.service

# Configure Nginx
sudo cp scripts/sprintflow.nginx.conf /etc/nginx/sites-available/sprintflow
sudo ln -sf /etc/nginx/sites-available/sprintflow /etc/nginx/sites-enabled/sprintflow
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Enable services to start on boot
sudo systemctl daemon-reload
sudo systemctl enable sprintflow-api sprintflow-celery
```

### 4.5 Set up Python virtualenv and install dependencies

```bash
cd /home/ubuntu/SprintFlow
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 4.6 Run database migrations

```bash
export AWS_REGION=ap-south-1
DB_HOST=$(aws ssm get-parameter --name "/sprintflow/db_host" --query "Parameter.Value" --output text)
DB_PASS=$(aws ssm get-parameter --name "/sprintflow/db_password" --with-decryption --query "Parameter.Value" --output text)
export DATABASE_URL="postgresql+psycopg://postgres:${DB_PASS}@${DB_HOST}:5432/sprintflow"

cd backend
../venv/bin/alembic upgrade head
# Should print: Running upgrade -> 0001, initial schema

unset DATABASE_URL DB_PASS
```

### 4.7 Start services

```bash
sudo systemctl start sprintflow-api sprintflow-celery

# Verify both are running
sudo systemctl status sprintflow-api
sudo systemctl status sprintflow-celery

# Test API is reachable
curl http://localhost/api/health
# Expected: {"status":"ok","service":"SprintFlow API"}
```

---

## Part 5 — Lambda AI Setup

### 5.1 Update the IAM role trust policy

Lambda needs permission to assume the EC2 role. Run this from your **local machine** (save as `trust-policy.json` first):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": ["ec2.amazonaws.com", "lambda.amazonaws.com"]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```bash
aws iam update-assume-role-policy \
  --role-name sprintflow-ec2-role \
  --policy-document file://trust-policy.json
```

> **Note:** You need to reapply this trust policy every time the EC2 instance is restarted, as the role's trust configuration may reset.

### 5.2 Deploy the Lambda function

```bash
cd scripts
zip lambda_function.zip lambda_function.py

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws lambda create-function \
  --function-name sprintflow-task-refiner \
  --runtime python3.11 \
  --role "arn:aws:iam::${ACCOUNT_ID}:role/sprintflow-ec2-role" \
  --handler lambda_function.handler \
  --zip-file fileb://lambda_function.zip \
  --timeout 30 \
  --region ap-south-1
```

### 5.3 Add the Groq API key

```bash
aws lambda update-function-configuration \
  --function-name sprintflow-task-refiner \
  --environment "Variables={GROQ_API_KEY=gsk_YOUR_KEY_HERE}" \
  --region ap-south-1
```

### 5.4 Test it

```bash
# Linux/Mac
aws lambda invoke \
  --function-name sprintflow-task-refiner \
  --payload '{"prompt":"fix login bug"}' \
  --cli-binary-format raw-in-base64-out \
  --region ap-south-1 \
  response.json && cat response.json

# Windows PowerShell
$payload = '{"prompt":"fix login bug"}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$base64 = [Convert]::ToBase64String($bytes)
aws lambda invoke --function-name sprintflow-task-refiner --payload $base64 --region ap-south-1 response.json
Get-Content response.json
```

Expected output:
```json
{"suggestions": ["Debug authentication token expiration", "Fix session persistence after login", ...]}
```

---

## Part 6 — CI/CD Setup

### 6.1 Create a CI/CD IAM user

In AWS Console → IAM → Users → Create user `sprintflow-cicd`. Add this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::sprintflow-frontend-*",
        "arn:aws:s3:::sprintflow-frontend-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "*"
    }
  ]
}
```

Generate an access key for this user (Security credentials tab → Create access key → CLI).

### 6.2 Add GitHub repository secrets

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Value | Where to find it |
|---|---|---|
| `EC2_HOST` | `13.x.x.x` | `terraform output ec2_public_ip` |
| `EC2_SSH_KEY` | Full `.pem` file contents | `cat ~/.ssh/sprintflow-key.pem` |
| `AWS_ACCESS_KEY_ID` | CI/CD user access key | AWS Console |
| `AWS_SECRET_ACCESS_KEY` | CI/CD user secret key | AWS Console |
| `AWS_REGION` | `ap-south-1` | — |
| `FRONTEND_BUCKET` | `sprintflow-frontend-XXXX` | `terraform output frontend_bucket` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `EXXXXXXXXX` | `terraform output cloudfront_distribution_id` |
| `CLOUDFRONT_DOMAIN` | `dXXXXX.cloudfront.net` | `terraform output cloudfront_domain` (no https://) |

### 6.3 Set up git remote with PAT (on EC2)

```bash
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/SprintFlow
git remote set-url origin https://YOUR_GITHUB_USERNAME:YOUR_PAT@github.com/harshini0804/SprintFlow.git
```

### 6.4 Trigger first deployment

```bash
git commit --allow-empty -m "trigger first deployment"
git push origin main
```

Watch the **Actions** tab — two parallel jobs run:
- **Build and deploy React to S3 + CloudFront** (~35 seconds)
- **Deploy FastAPI to EC2** (~25 seconds)

Both should show green checkmarks.

---

## Part 7 — Stripe Billing (Optional)

### 7.1 Create product and get keys

1. Sign up at [dashboard.stripe.com](https://dashboard.stripe.com) → enable **Test mode**
2. Developers → API keys → copy Secret key (`sk_test_...`)
3. Product catalog → Add product → name "SprintFlow Pro" → recurring price $15/month
4. Copy the Price ID (`price_...`)

### 7.2 Update SSM and backend code

```bash
aws ssm put-parameter \
  --name "/sprintflow/stripe_secret_key" \
  --value "sk_test_YOUR_KEY" \
  --type SecureString \
  --overwrite \
  --region ap-south-1
```

In `backend/app/routers/misc.py`, replace `price_REPLACE_WITH_STRIPE_PRICE_ID` with your actual price ID. Commit and push.

### 7.3 Set up webhook

1. Stripe → Developers → Webhooks → Add endpoint
2. URL: `https://YOUR_CLOUDFRONT_DOMAIN/api/billing/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy Signing secret (`whsec_...`)

```bash
aws ssm put-parameter \
  --name "/sprintflow/stripe_webhook_secret" \
  --value "whsec_YOUR_SECRET" \
  --type SecureString \
  --overwrite \
  --region ap-south-1

# Restart API to pick up new secrets
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP "sudo systemctl restart sprintflow-api"
```

---

## Daily Restart Checklist

EC2 gets a **new public IP every time it stops and starts** (no Elastic IP to stay in free tier). Follow these steps each time you resume work:

### Step 1 — Start EC2

```bash
aws ec2 start-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1
```

Wait 30 seconds, then get the new IP and DNS:

```bash
aws ec2 describe-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1 \
  --query "Reservations[].Instances[].PublicIpAddress" \
  --output text

aws ec2 describe-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1 \
  --query "Reservations[].Instances[].PublicDnsName" \
  --output text
```

### Step 2 — Update GitHub secret

GitHub → repo → Settings → Secrets → `EC2_HOST` → update to new IP.

### Step 3 — Update main.tf and apply Terraform

In `infra/main.tf`, find the EC2 CloudFront origin and update `domain_name`:

```hcl
origin {
  domain_name = "ec2-NEW-IP-FORMAT.ap-south-1.compute.amazonaws.com"
  origin_id   = "ec2-backend"
  ...
}
```

```bash
cd infra && terraform apply
# Takes ~30 seconds — only updates CloudFront
```

### Step 4 — Reapply Lambda trust policy

```bash
aws iam update-assume-role-policy \
  --role-name sprintflow-ec2-role \
  --policy-document file://trust-policy.json
```

### Step 5 — Verify EC2 services

```bash
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@NEW_EC2_IP

sudo systemctl status sprintflow-api
sudo systemctl status sprintflow-celery

# If either is stopped:
sudo systemctl start sprintflow-api
sudo systemctl start sprintflow-celery

# Verify API is healthy
curl http://localhost/api/health
```

### Step 6 — Trigger redeploy

```bash
git commit --allow-empty -m "redeploy after EC2 restart"
git push origin main
```

### Step 7 — Stop EC2 when done

```bash
aws ec2 stop-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1
```

---

## Useful Commands

### View logs on EC2

```bash
# API logs (live)
sudo journalctl -u sprintflow-api -f

# Worker logs (live)
sudo journalctl -u sprintflow-celery -f

# Last 50 lines
sudo journalctl -u sprintflow-api -n 50 --no-pager
sudo journalctl -u sprintflow-celery -n 50 --no-pager

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart services

```bash
sudo systemctl restart sprintflow-api
sudo systemctl restart sprintflow-celery
sudo systemctl reload nginx
```

### Connect to the database from EC2

```bash
# Install psql client if needed
sudo apt-get install -y postgresql-client

export AWS_REGION=ap-south-1
DB_HOST=$(aws ssm get-parameter --name "/sprintflow/db_host" --query "Parameter.Value" --output text)
DB_PASS=$(aws ssm get-parameter --name "/sprintflow/db_password" --with-decryption --query "Parameter.Value" --output text)
psql "postgresql://postgres:${DB_PASS}@${DB_HOST}:5432/sprintflow"
```

### Connect to RDS via pgAdmin (SSH tunnel)

```bash
# Open tunnel — keep this terminal open
ssh -i ~/.ssh/sprintflow-key.pem -L 5433:YOUR_RDS_ENDPOINT:5432 ubuntu@YOUR_EC2_IP -N
```

In pgAdmin → New Server:
- Host: `localhost`
- Port: `5433`
- Database: `sprintflow`
- Username: `postgres`
- Password: your `db_password` from `terraform.tfvars`

### Update an SSM secret

```bash
aws ssm put-parameter \
  --name "/sprintflow/jwt_secret" \
  --value "new-secret-value" \
  --type SecureString \
  --overwrite \
  --region ap-south-1

# Restart API to pick up
sudo systemctl restart sprintflow-api
```

### Invalidate CloudFront cache

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*" \
  --region ap-south-1
```

### Run a new Alembic migration

```bash
# On EC2 in /home/ubuntu/SprintFlow/backend
source ../venv/bin/activate
export DATABASE_URL="postgresql+psycopg://..."
alembic revision --autogenerate -m "describe_your_change"
alembic upgrade head
```

### Redeploy Lambda function

```bash
cd scripts
zip lambda_function.zip lambda_function.py

aws lambda update-function-code \
  --function-name sprintflow-task-refiner \
  --zip-file fileb://lambda_function.zip \
  --region ap-south-1
```

### Tear down everything (irreversible — deletes all data)

```bash
cd infra
terraform destroy
```

---

## AWS Free Tier Cost Breakdown

| Service | Free tier limit | Expected usage |
|---|---|---|
| EC2 t3.micro | 750 hrs/month for 12 months | ~720 hrs |
| RDS db.t3.micro | 750 hrs/month, 20GB for 12 months | ~720 hrs |
| S3 (both buckets) | 5GB storage, 20K GET, 2K PUT | < 1GB |
| CloudFront | 1TB egress, 10M requests/month | < 10GB |
| SNS | 1M publishes/month (always free) | < 1K |
| SQS | 1M requests/month (always free) | < 1K |
| SES | 3,000 messages/month (always free) | < 500 |
| Lambda | 1M invocations/month (always free) | < 1K |
| SSM Parameter Store | Standard parameters free | ~15 params |

After 12 months, EC2 + RDS costs approximately **$15–20/month** at on-demand rates.

---

## Conclusion

- Designed and deployed a **multi-tenant SaaS backend** using FastAPI + PostgreSQL on EC2 with zero-config secret management via **AWS SSM Parameter Store** and an **IAM instance role** — no credentials stored anywhere on the server

- Built a **decoupled React frontend** served through **CloudFront with Origin Access Control (OAC)**, ensuring the S3 bucket is never publicly accessible — all requests go through CloudFront HTTPS

- Implemented a fully **asynchronous email pipeline**: FastAPI publishes to SNS (fire-and-forget) → SNS delivers to SQS → a direct SQS poller worker parses the SNS envelope and sends via SES — no Redis, no external broker

- **S3 file uploads use pre-signed PUT/GET URLs** — the server generates a short-lived signed URL and the client uploads directly to S3, keeping binary file data entirely off the application server

- Provisioned **42 AWS resources** with a single `terraform apply` — VPC, subnets, route tables, internet gateway, security groups, EC2, RDS, two S3 buckets, CloudFront (dual-origin with `/api/*` routing), SNS, SQS, Lambda, IAM role + policy + instance profile, 12 SSM parameters — eliminating all manual console work

- Set up a **parallel GitHub Actions CI/CD pipeline**: push to main simultaneously builds and deploys React to S3 + invalidates CloudFront cache, and SSHs into EC2 to pull code, install deps, run Alembic migrations, and restart systemd services

- Integrated **AI task refinement via AWS Lambda** calling the Groq API (LLaMA 3.1 8B, free tier) — Lambda is invoked directly from FastAPI using the EC2 IAM role, no API gateway needed

- Implemented **role-based access control** (owner / admin / member / viewer) enforced at the backend API level — privileged operations like inviting members, removing users, and renaming workspaces are gated by role checks on every request
