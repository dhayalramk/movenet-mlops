#!/usr/bin/env bash
set -euo pipefail

STAGE=${1:-stg}
: "${AWS_REGION:=ap-south-1}"
: "${PROJECT:=movenet}"

# Where to store results: local | s3
: "${STORE_BACKEND:=local}"

# Frontend origin(s) for CORS (comma-separated or '*')
: "${CORS_ORIGINS:=*}"

# Metrics to CloudWatch?
: "${ALLOW_CLOUDWATCH:=false}"

ACC=$(aws sts get-caller-identity --query Account --output text)
DEFAULT_BUCKET="${PROJECT}-${STAGE}-results-${ACC}-${AWS_REGION}"
: "${S3_BUCKET:=${DEFAULT_BUCKET}}"
: "${S3_PREFIX:=results/}"

echo "Stage:             $STAGE"
echo "Store backend:     $STORE_BACKEND"
echo "CORS origins:      $CORS_ORIGINS"
echo "Allow CloudWatch:  $ALLOW_CLOUDWATCH"
if [[ "$STORE_BACKEND" == "s3" ]]; then
  echo "S3 bucket:         $S3_BUCKET"
  echo "S3 prefix:         $S3_PREFIX"
fi
echo

# 1) ECR repository stack
aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "${PROJECT}-ecr-${STAGE}" \
  --template-file cfn/ecr.yml \
  --parameter-overrides Project="$PROJECT" Stage="$STAGE"

ECR_URI=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-ecr-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" --output text)

# 2) Build & push image
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$(echo "$ECR_URI" | cut -d/ -f1)"

docker build -t "${PROJECT}-backend" backend
docker tag "${PROJECT}-backend:latest" "${ECR_URI}:${STAGE}"
docker push "${ECR_URI}:${STAGE}"

# 3) Create S3 bucket if using s3 and bucket doesn't exist
if [[ "$STORE_BACKEND" == "s3" ]]; then
  if ! aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
    echo "Creating S3 bucket: $S3_BUCKET"
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
    aws s3api put-public-access-block --bucket "$S3_BUCKET" \
      --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws s3api put-bucket-encryption --bucket "$S3_BUCKET" \
      --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
    aws s3api put-bucket-versioning --bucket "$S3_BUCKET" \
      --versioning-configuration Status=Enabled
  else
    echo "Bucket exists: $S3_BUCKET"
  fi
fi

# 4) Deploy/update App Runner via CFN (with CAPABILITY_IAM)
aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "${PROJECT}-backend-${STAGE}" \
  --template-file cfn/backend-apprunner.yml \
  --parameter-overrides \
    Project="$PROJECT" Stage="$STAGE" ImageUri="${ECR_URI}:${STAGE}" \
    StoreBackend="$STORE_BACKEND" S3BucketName="$S3_BUCKET" S3Prefix="$S3_PREFIX" \
    CorsOrigins="$CORS_ORIGINS" AllowCloudWatch="$ALLOW_CLOUDWATCH" \
  --capabilities CAPABILITY_NAMED_IAM

BACKEND_URL=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-backend-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text)

echo "App Runner URL: $BACKEND_URL"
