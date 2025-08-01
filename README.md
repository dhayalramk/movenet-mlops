# MoveNet MLOps – Full Package

**Updated:** 2025-08-01

This repository implements the full assignment.

## Quick Start (Local / Codespaces)
Frontend:
```
cd frontend
python3 -m http.server 8080
```
Backend:
```
cd backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## CI/CD
See .github/workflows/ (frontend to S3; backend to ECR → App Runner).

## AWS Setup
Use cfn/ templates or Console per README in earlier messages.