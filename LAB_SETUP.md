# SprintFlow — Complete Lab Ubuntu System Setup Guide

> Every step in this guide is performed on the **lab Ubuntu system** itself.
> Follow every step in exact order. Do not skip any step.

---

## Before You Come to the Lab — Files to Prepare

You must have these ready **before** sitting at the lab system.
Send them to yourself via email or carry on a USB drive.

| File / Detail | Where to find it | Why needed |
|---|---|---|
| `terraform.tfstate` | `sprintflow/infra/terraform.tfstate` on your Windows laptop | Terraform needs this to know what's already deployed |
| `terraform.tfvars` | `sprintflow/infra/terraform.tfvars` on your Windows laptop | Contains DB password, JWT secret, SES email etc. |
| `sprintflow-key.pem` | `C:\Users\akshi\.ssh\sprintflow-key.pem` on your Windows laptop | SSH key to access EC2 |
| AWS Access Key ID | From your IAM admin user (account `728393074277`) | AWS CLI authentication |
| AWS Secret Access Key | From your IAM admin user (account `728393074277`) | AWS CLI authentication |
| GitHub PAT | Generate at GitHub → Settings → Developer settings → Tokens (classic) → `repo` scope | Git push authentication |
| EC2 Instance ID | `i-02e3ddc50c8812970` | Starting/stopping EC2 |
| CloudFront URL | `https://dur0x8yh4xpb3.cloudfront.net` | Production app URL |
| GitHub repo URL | `https://github.com/harshini0804/SprintFlow.git` | Cloning the repo |

---

## Part 1 — Install System Dependencies

> **Terminal:** Any terminal, any folder

### Step 1.1 — Update system packages

```bash
sudo apt-get update -y
sudo apt-get upgrade -y
```

### Step 1.2 — Install essential tools

```bash
sudo apt-get install -y \
  curl wget git unzip build-essential \
  software-properties-common apt-transport-https \
  ca-certificates gnupg lsb-release
```

### Step 1.3 — Install Python 3.11

```bash
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update -y
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
```

Verify:
```bash
python3.11 --version
# Expected: Python 3.11.x
```

### Step 1.4 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify:
```bash
node --version    # Expected: v20.x.x
npm --version     # Expected: 10.x.x
```

### Step 1.5 — Install Docker

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker --version
docker compose version
```

### Step 1.6 — Install AWS CLI

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip
```

Verify:
```bash
aws --version
# Expected: aws-cli/2.x.x
```

### Step 1.7 — Install Terraform

```bash
wget -4 https://releases.hashicorp.com/terraform/1.6.6/terraform_1.6.6_linux_amd64.zip
unzip terraform_1.6.6_linux_amd64.zip
sudo mv terraform /usr/local/bin/
rm terraform_1.6.6_linux_amd64.zip
```

Verify:
```bash
terraform --version
# Expected: Terraform v1.6.6
```

### Step 1.8 — Install PostgreSQL client (for database access)

```bash
sudo apt-get install -y postgresql-client
```

---

## Part 2 — Configure AWS CLI

> **Terminal:** Any terminal, any folder

```bash
aws configure
```

Enter when prompted:
```
AWS Access Key ID:     AKIA... (from your notes/email)
AWS Secret Access Key: ...     (from your notes/email)
Default region name:  ap-south-1
Default output format: json
```

Verify correct account:
```bash
aws sts get-caller-identity
# Must show: "Account": "728393074277"
```

If it shows a different account ID, stop — you have the wrong credentials.

---

## Part 3 — Set Up SSH Key

> **Terminal:** Any terminal, any folder

Copy `sprintflow-key.pem` from your USB drive or email attachment to the system:

```bash
mkdir -p ~/.ssh

# If from USB drive (check USB mount point first with: lsblk)
cp /media/$USER/YOUR_USB_NAME/sprintflow-key.pem ~/.ssh/sprintflow-key.pem

# OR if downloaded from email to Downloads folder
cp ~/Downloads/sprintflow-key.pem ~/.ssh/sprintflow-key.pem
```

Set correct permissions:
```bash
chmod 400 ~/.ssh/sprintflow-key.pem
```

Verify:
```bash
ls -la ~/.ssh/sprintflow-key.pem
# Must show: -r-------- (read only for owner)
```

---

## Part 4 — Clone the Repository

> **Terminal:** Any terminal, home folder `~`

```bash
cd ~
git clone https://github.com/harshini0804/SprintFlow.git
```

When prompted:
- Username: `harshini0804`
- Password: your PAT (from your notes/email)

```bash
cd SprintFlow
```

Set your git identity for this repo only (so commits show your name):
```bash
git config user.name "Harshini"
git config user.email "gharshini.mca25@rvce.edu.in"
```

Set remote URL with your PAT so pushes go to your account:
```bash
git remote set-url origin https://harshini0804:YOUR_PAT_HERE@github.com/harshini0804/SprintFlow.git
```

Save credentials permanently for this session:
```bash
git config credential.helper store
```

Verify clone:
```bash
ls
# Expected: backend  docker-compose.yml  frontend  infra  README.md  scripts  trust-policy.json
```

---

## Part 5 — Copy Terraform State and Vars Files

> **Terminal:** Any terminal, any folder

Copy `terraform.tfstate` and `terraform.tfvars` from your USB drive or email:

```bash
# From USB drive
cp /media/$USER/YOUR_USB_NAME/terraform.tfstate ~/SprintFlow/infra/terraform.tfstate
cp /media/$USER/YOUR_USB_NAME/terraform.tfvars ~/SprintFlow/infra/terraform.tfvars

# OR from Downloads folder
cp ~/Downloads/terraform.tfstate ~/SprintFlow/infra/terraform.tfstate
cp ~/Downloads/terraform.tfvars ~/SprintFlow/infra/terraform.tfvars
```

Verify:
```bash
ls ~/SprintFlow/infra/
# Must show terraform.tfstate and terraform.tfvars in the list
```

---

## Part 6 — Backend Setup

> **Terminal:** Terminal 1, folder `~/SprintFlow/backend`

### Step 6.1 — Create virtual environment

```bash
cd ~/SprintFlow/backend
python3.11 -m venv venv
source venv/bin/activate
```

Your prompt should now show `(venv)`.

### Step 6.2 — Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Takes 2-3 minutes.

### Step 6.3 — Create .env file

```bash
cp .env.example .env
nano .env
```

Replace the entire contents with:

```env
DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/sprintflow
JWT_SECRET=a87dcf3093e4d3fb3cc80648897a5858d00ba797702c94b565eeb3e219e13398
CLOUDFRONT_DOMAIN=localhost:5173

AWS_REGION=ap-south-1
S3_ASSETS_BUCKET=sprintflow-assets-728393074277
SNS_TOPIC_ARN=arn:aws:sns:ap-south-1:728393074277:sprintflow-email-notifications
SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/728393074277/sprintflow-celery-queue
SES_SENDER_EMAIL=gharshini.mca25@rvce.edu.in
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
```

Save: `Ctrl+X` → `Y` → `Enter`

### Step 6.4 — Set DATABASE_URL permanently in this session

```bash
export DATABASE_URL="postgresql+psycopg://postgres@localhost:5432/sprintflow"
```

Also add it to `.bashrc` so it persists:
```bash
echo 'export DATABASE_URL="postgresql+psycopg://postgres@localhost:5432/sprintflow"' >> ~/.bashrc
source ~/.bashrc
```

---

## Part 7 — Start Local PostgreSQL

> **Terminal:** Terminal 1, folder `~/SprintFlow`

```bash
cd ~/SprintFlow
docker compose up -d
```

Wait 10 seconds, verify:
```bash
docker ps
# Must show postgres container status as "Up"
```

---

## Part 8 — Run Database Migrations

> **Terminal:** Terminal 1, folder `~/SprintFlow/backend`

```bash
cd ~/SprintFlow/backend
source venv/bin/activate
alembic upgrade head
```

Expected:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial schema
```

If you get `DATABASE_URL not set` error:
```bash
export DATABASE_URL="postgresql+psycopg://postgres@localhost:5432/sprintflow"
alembic upgrade head
```

---

## Part 9 — Start EC2 Instance

> **Terminal:** Terminal 2, any folder

```bash
aws ec2 start-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1
```

Wait 30 seconds, then get new IP and DNS:

```bash
aws ec2 describe-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1 \
  --query "Reservations[].Instances[].PublicIpAddress" \
  --output text
```

```bash
aws ec2 describe-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1 \
  --query "Reservations[].Instances[].PublicDnsName" \
  --output text
```

**Note both values down** — you'll need them in the next steps.

---

## Part 10 — Update main.tf with New EC2 DNS

> **Terminal:** Terminal 2, folder `~/SprintFlow/infra`

```bash
cd ~/SprintFlow/infra
nano main.tf
```

Search for the EC2 origin block (press `Ctrl+W` to search for `ec2-backend`):

Find this line:
```hcl
domain_name = "ec2-OLD-DNS.ap-south-1.compute.amazonaws.com"
```

Replace with the new DNS from Step 9:
```hcl
domain_name = "ec2-NEW-DNS-HERE.ap-south-1.compute.amazonaws.com"
```

Save: `Ctrl+X` → `Y` → `Enter`

---

## Part 11 — Run Terraform Apply

> **Terminal:** Terminal 2, folder `~/SprintFlow/infra`

```bash
cd ~/SprintFlow/infra
terraform init
terraform apply
```

Review the plan — must show `Plan: 0 to add, 2 to change, 0 to destroy`.

The 2 changes are:
- CloudFront origin DNS update ✅
- IAM role Lambda trust being reverted ✅ (will fix in next step)

Type `yes` and press Enter. Takes about 2 minutes.

---

## Part 12 — Reapply Lambda Trust Policy

> **Terminal:** Terminal 2, folder `~/SprintFlow`

Run this **immediately** after terraform apply completes:

```bash
cd ~/SprintFlow
aws iam update-assume-role-policy \
  --role-name sprintflow-ec2-role \
  --policy-document file://trust-policy.json
```

No output means success. Verify it applied:

```bash
aws iam get-role \
  --role-name sprintflow-ec2-role \
  --query "Role.AssumeRolePolicyDocument.Statement[0].Principal.Service" \
  --output text
```

Must show both `ec2.amazonaws.com` and `lambda.amazonaws.com`.

---

## Part 13 — Update GitHub Secret EC2_HOST

> **Browser** — open GitHub in any browser on the lab machine

1. Go to `https://github.com/harshini0804/SprintFlow`
2. Settings → Secrets and variables → Actions
3. Click `EC2_HOST` → Update
4. Paste the new IP from Step 9
5. Save

---

## Part 14 — Commit and Push main.tf

> **Terminal:** Terminal 2, folder `~/SprintFlow`

```bash
cd ~/SprintFlow
git add infra/main.tf
git commit -m "update EC2 DNS for lab session"
git push origin main
```

Open GitHub Actions tab in browser:
`https://github.com/harshini0804/SprintFlow/actions`

Wait for both jobs to go green:
- ✅ Build and deploy React to S3 + CloudFront
- ✅ Deploy FastAPI to EC2

---

## Part 15 — Verify EC2 Services

> **Terminal:** Terminal 2, any folder

```bash
ssh -i ~/.ssh/sprintflow-key.pem ubuntu@NEW_EC2_IP
```

Inside EC2:
```bash
sudo systemctl status sprintflow-api
sudo systemctl status sprintflow-celery
```

Both must show `active (running)`.

Verify API health:
```bash
curl http://localhost/api/health
# Expected: {"status":"ok","service":"SprintFlow API"}
```

Exit EC2:
```bash
exit
```

---

## Part 16 — Start Local Backend

> **Terminal:** Terminal 1, folder `~/SprintFlow/backend`

```bash
cd ~/SprintFlow/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Leave this running. Open Terminal 3.

---

## Part 17 — Start Local Frontend

> **Terminal:** Terminal 3, folder `~/SprintFlow/frontend`

```bash
cd ~/SprintFlow/frontend
npm install
npm run dev -- --host 0.0.0.0
```

---

## Part 18 — Access the App

**Local app (Terminal 3 shows the IP):**
```
http://localhost:5173
```

**From host machine browser if using VirtualBox:**
```bash
# Get VM IP
hostname -I | awk '{print $1}'
```
Then open `http://VM_IP:5173` in host browser.

**Production app (all AWS features):**
```
https://dur0x8yh4xpb3.cloudfront.net
```

---

## Terminal Layout Summary

| Terminal | Location | Command | Purpose |
|---|---|---|---|
| Terminal 1 | `~/SprintFlow/backend` | `uvicorn app.main:app --reload --port 8000` | FastAPI backend |
| Terminal 2 | `~/SprintFlow` | AWS CLI + git commands | AWS + deployment |
| Terminal 3 | `~/SprintFlow/frontend` | `npm run dev -- --host 0.0.0.0` | React frontend |

---

## Stop EC2 When Done

> **Terminal:** Terminal 2, any folder

```bash
aws ec2 stop-instances \
  --instance-ids i-02e3ddc50c8812970 \
  --region ap-south-1
```

Stop local servers: `Ctrl+C` in Terminal 1 and Terminal 3.

Stop Docker:
```bash
docker compose down
```

---

## Cleanup Command — Run After Demo

> **Terminal:** Any terminal, any folder

Run this single command to remove all your credentials from the lab system:

```bash
cd ~/SprintFlow && \
git config --unset user.name && \
git config --unset user.email && \
git remote set-url origin https://github.com/harshini0804/SprintFlow.git && \
rm -f ~/.git-credentials && \
rm -f ~/.aws/credentials && \
rm -f ~/.aws/config && \
rm -f ~/.ssh/sprintflow-key.pem && \
echo "Cleanup complete — all credentials removed"
```

---

## Files and Details to Prepare Before Coming to Lab

Send these to yourself via email or carry on USB drive:

### Files (must be transferred physically)

| File | Path on Windows laptop | Notes |
|---|---|---|
| `terraform.tfstate` | `sprintflow\infra\terraform.tfstate` | Critical — without this terraform won't work |
| `terraform.tfvars` | `sprintflow\infra\terraform.tfvars` | Contains all secrets — never commit this |
| `sprintflow-key.pem` | `C:\Users\akshi\.ssh\sprintflow-key.pem` | EC2 SSH key |

### Credentials to note down

| Credential | Value | Where to get it |
|---|---|---|
| AWS Access Key ID | `AKIA...` | AWS Console → IAM → Users → your user → Security credentials |
| AWS Secret Access Key | `...` | Same as above (regenerate if lost) |
| GitHub PAT | `ghp_...` | GitHub → Settings → Developer settings → Tokens (classic) → Generate new |
| EC2 Instance ID | `i-02e3ddc50c8812970` | Already known |
| CloudFront URL | `https://dur0x8yh4xpb3.cloudfront.net` | Already known |

### Important notes
- GitHub PAT expires — generate a fresh one the day before your demo
- `terraform.tfvars` contains your DB password and JWT secret — handle carefully
- `terraform.tfstate` is large — email may block it, use USB drive instead
- After cleanup, the lab machine has zero trace of your credentials

