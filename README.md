# SprintFlow

A full-stack SaaS project management app built for campus placement portfolios. Kanban boards, team collaboration, email notifications, file attachments, AI task refinement, and billing — deployed on AWS free tier without Docker.

**Tech stack:** FastAPI · PostgreSQL (RDS) · React + Vite · Tailwind CSS · AWS (EC2, S3, CloudFront, SNS, SQS, SES, Lambda, SSM) · Terraform · GitHub Actions

---

## Repository structure

```
sprintflow/
├── backend/                  FastAPI app, Alembic migrations
│   ├── app/
│   │   ├── core/             Settings (SSM), JWT, security
│   │   ├── db/               SQLAlchemy session
│   │   ├── models/           All database models
│   │   ├── routers/          auth, workspace, projects, misc
│   │   ├── schemas/          Pydantic request/response models
│   │   └── services/         AWS boto3 wrappers, notifications, limits
│   ├── alembic/              Database migrations
│   ├── worker.py             Celery worker (SQS broker, no Redis)
│   └── requirements.txt
├── frontend/                 React + Vite + TypeScript
│   └── src/
│       ├── api/client.ts     Axios + all API methods
│       ├── hooks/useAuth.tsx  Auth context and ProtectedRoute
│       └── pages/            Dashboard, Board (Kanban), Settings, Auth
├── infra/                    Terraform — all AWS resources
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── scripts/                  systemd services, Nginx config, Lambda function
├── .github/workflows/        GitHub Actions CI/CD
└── docker-compose.yml        Local dev — PostgreSQL only
```

---

## Prerequisites

Install these on your machine before starting.

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org/) |
| Git | any | [git-scm.com](https://git-scm.com/) |
| Terraform CLI | 1.6+ | [terraform.io/downloads](https://developer.hashicorp.com/terraform/downloads) |
| AWS CLI v2 | 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Docker Desktop | any | [docker.com](https://www.docker.com/products/docker-desktop/) — for local PostgreSQL only |

---

## Part 1 — Local development setup

### 1.1 Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/sprintflow.git
cd sprintflow
```

### 1.2 Start local PostgreSQL

```bash
docker compose up -d
# Starts postgres on localhost:5432
# Username: postgres  Password: postgres  DB: sprintflow
```

### 1.3 Set up the Python backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install all dependencies
pip install -r requirements.txt

# Copy the environment template
cp .env.example .env
# Edit .env — at minimum fill in DATABASE_URL and JWT_SECRET
# For local dev you can leave AWS values empty to skip AWS features
```

### 1.4 Run database migrations

```bash
# Still inside backend/ with venv activated
alembic upgrade head
# Creates all 13 tables in your local PostgreSQL
```

### 1.5 Start the backend server

```bash
uvicorn app.main:app --reload --port 8000
# API running at http://localhost:8000
# Swagger docs at http://localhost:8000/api/docs
```

### 1.6 Set up and start the frontend

```bash
# Open a new terminal in the project root
cd frontend
npm install
npm run dev
# Frontend at http://localhost:5173
# /api requests proxy to localhost:8000 via vite.config.ts
```

### 1.7 (Optional) Start the Celery worker locally

Email notifications require a running Celery worker. For local dev you can skip this — internal bell notifications still work without it.

```bash
# Inside backend/ with venv activated and .env loaded
celery -A app.worker worker --loglevel=info
# Connects to SQS — requires AWS credentials in .env with real SQS queue
```

Local dev is now complete. Open `http://localhost:5173`, register a workspace, and use the app.

---

## Part 2 — AWS prerequisites (one-time)

### 2.1 Create an AWS account and configure the CLI

```bash
# Create a free-tier AWS account at https://aws.amazon.com
# Then create an IAM user with AdministratorAccess for Terraform

aws configure
# AWS Access Key ID:     (your IAM user access key)
# AWS Secret Access Key: (your IAM user secret)
# Default region:        ap-south-1
# Default output format: json
```

### 2.2 Create an EC2 key pair

```bash
# In the AWS Console: EC2 → Key Pairs → Create key pair
# Name: sprintflow-key
# Type: RSA, format: .pem
# Download and save the .pem file

# Set permissions
chmod 400 ~/.ssh/sprintflow-key.pem
```

### 2.3 Verify your SES sender email

SES starts in sandbox mode — you must verify the address you'll send from.

```bash
# In the AWS Console: SES → Verified identities → Create identity
# Choose "Email address" and enter your sender email
# Click the verification link AWS sends you

# For production (sending to anyone, not just verified addresses):
# SES → Account dashboard → Request production access
# Fill out the form — approval typically takes 24 hours
```

### 2.4 (Optional) Get an Anthropic API key for AI task refinement

```bash
# Sign up at https://console.anthropic.com
# Create an API key
# You'll add it as a Lambda environment variable in Part 4 below
# The Lambda falls back to rule-based suggestions if no key is set
```

### 2.5 (Optional) Set up Stripe

```bash
# Sign up at https://dashboard.stripe.com
# Get your test secret key: sk_test_...
# Create a product + price for your Pro plan
# Note the price ID: price_...
# You'll replace the placeholder in backend/app/routers/misc.py

# For webhooks (after deployment):
# Stripe dashboard → Webhooks → Add endpoint
# URL: http://YOUR_EC2_IP/api/billing/webhook
# Events: checkout.session.completed, invoice.payment_failed, customer.subscription.deleted
```

---

## Part 3 — Terraform: provision all AWS infrastructure

### 3.1 Create your tfvars file

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
aws_region       = "ap-south-1"
project_name     = "sprintflow"
ec2_key_name     = "sprintflow-key"         # Must match the key pair you created
allowed_ssh_cidr = "203.0.113.5/32"         # Your IP: curl ifconfig.me

db_password      = "YourSecurePassword123"   # No special chars like @ or /
db_username      = "postgres"
db_name          = "sprintflow"

# Generate a strong secret:
# python3 -c "import secrets; print(secrets.token_hex(32))"
jwt_secret       = "paste-your-generated-secret-here"

ses_sender_email = "noreply@yourdomain.com"  # Must be verified in SES

stripe_secret_key     = "sk_test_..."        # From Stripe dashboard
stripe_webhook_secret = "whsec_..."          # From Stripe webhook endpoint
```

### 3.2 Initialise and apply Terraform

```bash
# Still inside infra/
terraform init
terraform plan    # Review what will be created — ~25 resources

terraform apply   # Type "yes" when prompted
# Takes 8–12 minutes (RDS provisioning is the slow step)
```

### 3.3 Note the outputs

After `apply` completes, Terraform prints all outputs. Save these — you'll need them for GitHub secrets.

```
ec2_public_ip              = "13.233.x.x"
cloudfront_domain          = "https://d1abc123xyz.cloudfront.net"
frontend_bucket            = "sprintflow-frontend-123456789"
cloudfront_distribution_id = "EABC123DEF"
ssh_command                = "ssh -i ~/.ssh/sprintflow-key.pem ubuntu@13.233.x.x"
```

Re-read outputs any time:
```bash
terraform output
terraform output -raw ec2_public_ip
```

---

## Part 4 — First-time EC2 server setup (run once)

### 4.1 SSH into your EC2 instance

```bash
# Use the ssh_command from terraform output
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP
```

### 4.2 Wait for the bootstrap to finish

The `user_data` script installs Python, Nginx, and Git on first boot. It may still be running when you first SSH in. Check:

```bash
cat /tmp/bootstrap-done.txt
# Should print: Bootstrap complete
# If it doesn't exist yet, wait 1–2 minutes and check again
```

### 4.3 Clone the repository on the server

```bash
# Still SSH'd into EC2
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/sprintflow.git
cd sprintflow
```

### 4.4 Install systemd services and configure Nginx

```bash
# Copy service files
sudo cp scripts/sprintflow-api.service /etc/systemd/system/
sudo cp scripts/sprintflow-celery.service /etc/systemd/system/

# Configure Nginx
sudo cp scripts/sprintflow.nginx.conf /etc/nginx/sites-available/sprintflow
sudo ln -sf /etc/nginx/sites-available/sprintflow /etc/nginx/sites-enabled/sprintflow
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Enable services (they'll start automatically on reboot)
sudo systemctl daemon-reload
sudo systemctl enable sprintflow-api sprintflow-celery
```

### 4.5 Create the virtualenv and install dependencies

```bash
cd /home/ubuntu/sprintflow
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 4.6 Run Alembic migrations

The migration command fetches DB credentials from SSM automatically via the IAM instance role.

```bash
cd /home/ubuntu/sprintflow/backend

export AWS_REGION=ap-south-1

# Fetch DB credentials from SSM
DB_HOST=$(aws ssm get-parameter --name "/sprintflow/db_host" --query "Parameter.Value" --output text)
DB_PASS=$(aws ssm get-parameter --name "/sprintflow/db_password" --with-decryption --query "Parameter.Value" --output text)
export DATABASE_URL="postgresql://postgres:${DB_PASS}@${DB_HOST}:5432/sprintflow"

../venv/bin/alembic upgrade head

# Clear the env var — no secrets left in env
unset DATABASE_URL DB_PASS
```

### 4.7 Start the services

```bash
sudo systemctl start sprintflow-api sprintflow-celery

# Verify both are running
sudo systemctl status sprintflow-api
sudo systemctl status sprintflow-celery

# Tail logs if needed
sudo journalctl -u sprintflow-api -f
sudo journalctl -u sprintflow-celery -f
```

### 4.8 Test the API

```bash
curl http://localhost/api/health
# Expected: {"status":"ok","service":"SprintFlow API"}

# Also test from your laptop:
curl http://YOUR_EC2_IP/api/health
```

---

## Part 5 — Deploy the Lambda function

### 5.1 Package and deploy

```bash
# From the project root on your local machine
cd scripts

# Package into a zip
zip lambda_function.zip lambda_function.py

# Create the Lambda function (first time)
aws lambda create-function \
  --function-name sprintflow-task-refiner \
  --runtime python3.11 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/sprintflow-ec2-role \
  --handler lambda_function.handler \
  --zip-file fileb://lambda_function.zip \
  --region ap-south-1

# If updating an existing function:
aws lambda update-function-code \
  --function-name sprintflow-task-refiner \
  --zip-file fileb://lambda_function.zip \
  --region ap-south-1
```

### 5.2 Add the Anthropic API key (optional)

```bash
aws lambda update-function-configuration \
  --function-name sprintflow-task-refiner \
  --environment "Variables={ANTHROPIC_API_KEY=sk-ant-...}" \
  --region ap-south-1
```

Without the API key, the Lambda returns rule-based fallback suggestions — the feature still works, just less intelligently.

---

## Part 6 — GitHub Actions CI/CD setup

### 6.1 Create a CI/CD IAM user

In the AWS Console, create an IAM user with a policy scoped to only what CI/CD needs:

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
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/*"
    }
  ]
}
```

Generate an access key for this user.

### 6.2 Add GitHub repository secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add all of these:

| Secret name | Value | Where to find it |
|---|---|---|
| `EC2_HOST` | `13.233.x.x` | `terraform output ec2_public_ip` |
| `EC2_SSH_KEY` | Full contents of your `.pem` file | `cat ~/.ssh/sprintflow-key.pem` |
| `AWS_ACCESS_KEY_ID` | CI/CD IAM user key | AWS Console |
| `AWS_SECRET_ACCESS_KEY` | CI/CD IAM user secret | AWS Console |
| `AWS_REGION` | `ap-south-1` | |
| `FRONTEND_BUCKET` | `sprintflow-frontend-123456789` | `terraform output frontend_bucket` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `EABC123DEF` | `terraform output cloudfront_distribution_id` |

### 6.3 Trigger your first deployment

```bash
git add .
git commit -m "initial deployment"
git push origin main
```

Two parallel jobs run:

- `deploy-frontend`: builds React, syncs to S3, invalidates CloudFront cache
- `deploy-backend`: SSHs into EC2, pulls code, installs deps, runs migrations, restarts services

Watch progress in the **Actions** tab of your repo. Both jobs take about 3–4 minutes.

---

## Part 7 — Access the app

```
https://d1abc123xyz.cloudfront.net
```

Use the CloudFront domain from `terraform output cloudfront_domain`.

1. Open the URL in your browser
2. Click **Create workspace** and register
3. Create a project, add tasks, drag cards between columns
4. Invite a teammate — they'll receive an email via SES
5. Upload a file attachment to a task — it goes to S3 via pre-signed URL
6. Try the **✦ Enhance** button on a new task for AI suggestions

---

## Part 8 — Stripe billing (optional)

### 8.1 Create your Pro product

In the Stripe dashboard:
1. Products → Add product → Name: "SprintFlow Pro"
2. Add a price (e.g. $9/month recurring)
3. Copy the price ID: `price_1234abcXYZ...`

### 8.2 Update the codebase

In `backend/app/routers/misc.py`, find this line and replace the placeholder:

```python
# Before
line_items=[{"price": "price_REPLACE_WITH_STRIPE_PRICE_ID", "quantity": 1}],

# After
line_items=[{"price": "price_1234abcXYZ...", "quantity": 1}],
```

Commit and push — the deploy workflow will redeploy automatically.

### 8.3 Set up the webhook

In the Stripe dashboard:
1. Developers → Webhooks → Add endpoint
2. URL: `http://YOUR_EC2_IP/api/billing/webhook`
3. Select events: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`
4. Copy the webhook signing secret (`whsec_...`)
5. Update the SSM parameter:

```bash
aws ssm put-parameter \
  --name "/sprintflow/stripe_webhook_secret" \
  --value "whsec_..." \
  --type SecureString \
  --overwrite \
  --region ap-south-1
```

Then restart the API so it picks up the new value:
```bash
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP \
  "sudo systemctl restart sprintflow-api"
```

---

## Useful commands reference

### Viewing logs on EC2

```bash
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@YOUR_EC2_IP

# API logs
sudo journalctl -u sprintflow-api -f --since "1 hour ago"

# Celery worker logs
sudo journalctl -u sprintflow-celery -f --since "1 hour ago"

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restarting services

```bash
sudo systemctl restart sprintflow-api
sudo systemctl restart sprintflow-celery
sudo systemctl reload nginx
```

### Updating a secret without redeploying infrastructure

```bash
aws ssm put-parameter \
  --name "/sprintflow/jwt_secret" \
  --value "new-secret-value" \
  --type SecureString \
  --overwrite \
  --region ap-south-1

# Restart the API to pick up the new value
sudo systemctl restart sprintflow-api
```

### Connecting to the database

```bash
# From EC2 (psql must be installed: sudo apt-get install -y postgresql-client)
DB_HOST=$(aws ssm get-parameter --name "/sprintflow/db_host" --query "Parameter.Value" --output text)
DB_PASS=$(aws ssm get-parameter --name "/sprintflow/db_password" --with-decryption --query "Parameter.Value" --output text)
psql "postgresql://postgres:${DB_PASS}@${DB_HOST}:5432/sprintflow"
```

### Manually invalidating CloudFront cache

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*" \
  --region us-east-1
```

### Running a new migration

```bash
# On EC2, in /home/ubuntu/sprintflow/backend
source ../venv/bin/activate
export DATABASE_URL="postgresql://..."   # fetch from SSM as above
alembic revision --autogenerate -m "add_new_column"
alembic upgrade head
```

### Tearing down everything (destroys all data)

```bash
cd infra
terraform destroy
```

---

## Architecture summary

```
Browser
  │
  ├── HTTPS ──► CloudFront ──► S3 (React build, private)
  │
  └── HTTP ───► EC2 (Nginx :80)
                    └── /api/ ──► uvicorn (FastAPI :8000)
                                      │
                          ┌───────────┼───────────────┐
                          ▼           ▼               ▼
                    RDS Postgres  S3 Assets      SSM Params
                    (private)  (pre-signed URLs) (secrets)
                          │
                    FastAPI publishes ──► SNS ──► SQS
                                                   │
                                              Celery worker
                                                   │
                                                  SES
                                            (transactional email)

All AWS credentials: EC2 IAM instance role (no keys stored anywhere)
All secrets: SSM Parameter Store (no .env file on server)
IaC: Terraform provisions every resource above
CI/CD: GitHub Actions — push to main deploys frontend + backend
```

---

## Free tier AWS cost breakdown

All services below stay within AWS free tier for 12 months (EC2/RDS) or always-free limits.

| Service | Free tier | Expected usage |
|---|---|---|
| EC2 t2.micro | 750 hrs/month | ~720 hrs (always on) |
| RDS db.t3.micro | 750 hrs/month, 20GB | ~720 hrs |
| S3 (both buckets) | 5GB storage | < 1GB |
| CloudFront | 1TB egress, 10M req/month | < 10GB, < 100K req |
| SNS | 1M publishes/month | < 1K |
| SQS | 1M requests/month | < 1K |
| SES | 3,000 messages/month | < 500 |
| Lambda | 1M invocations/month | < 1K |
| SSM Parameter Store | Standard params free | < 20 params |

After 12 months, EC2 + RDS cost approximately $15–20/month at on-demand rates.

---

## Resume talking points

- Designed and deployed a multi-tenant SaaS backend using **FastAPI + PostgreSQL on EC2** with zero-config secret management via **SSM Parameter Store** and an **IAM instance role** — no credentials stored on the server
- Built a **decoupled frontend** served through **CloudFront with Origin Access Control**, ensuring the S3 bucket is never publicly exposed
- Implemented an **asynchronous email pipeline** using **SNS → SQS → Celery → SES** — FastAPI publishes fire-and-forget, the Celery worker handles delivery with retries
- Provisioned all 25+ AWS resources with a single `terraform apply` — VPC, subnets, SGs, EC2, RDS, S3, CloudFront, SNS, SQS, SSM, IAM — eliminating manual console work
- Set up a **parallel GitHub Actions CI/CD pipeline** that builds and deploys the React frontend to S3 + CloudFront and deploys the backend to EC2 via SSH on every push to main
- S3 file uploads use **pre-signed PUT/GET URLs** — the server generates a short-lived URL and the client uploads directly to S3, keeping file bytes off the application server entirely
