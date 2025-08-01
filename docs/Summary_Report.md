# Summary Report – MoveNet MLOps

- Frontend (TF.js): In-browser; variants; webcam + image + video; stats overlay.
- Backend (FastAPI): /predict (variant), /store, TF Hub loader, CloudWatch latency metric.
- CI/CD: GitHub Actions; frontend→S3; backend→ECR→App Runner.
- CloudFormation: ECR, App Runner, S3.
- Monitoring: Logs + metrics; thresholds to be set in CloudWatch.