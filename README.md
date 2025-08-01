# MoveNet MLOps – Full Package

**Updated:** 2025-08-01

This repository contains the full implementation of the MoveNet MLOps assignment, including:

- ✅ Backend with FastAPI & TensorFlow inference
- ✅ Frontend for uploading and viewing results
- ✅ AWS infrastructure for deployment (CI/CD, App Runner, S3)
- ✅ Model inference result logging

---

## 🚀 Quick Start

### ⚙️ Backend (API Server)

First-time setup (run once):

```bash
chmod +x scripts/setup_py310.sh
./scripts/setup_py310.sh


## Quick Start (Local / Codespaces)
Frontend:
```
cd frontend
python3 -m http.server 8080
```
Backend:
```
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

## CI/CD
See .github/workflows/ (frontend to S3; backend to ECR → App Runner).

## AWS Setup
Use cfn/ templates or Console per README in earlier messages.