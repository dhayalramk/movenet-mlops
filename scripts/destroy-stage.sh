#!/usr/bin/env bash
set -euo pipefail
STAGE=${1:-stg}
: "${AWS_REGION:=ap-south-1}"; : "${PROJECT:=movenet}"

SITE_BUCKET=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-frontend-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text 2>/dev/null || true)

if [ -n "$SITE_BUCKET" ]; then
  aws s3 rm "s3://${SITE_BUCKET}" --recursive || true
fi

aws cloudformation delete-stack --region "$AWS_REGION" --stack-name "${PROJECT}-frontend-${STAGE}" || true
aws cloudformation delete-stack --region "$AWS_REGION" --stack-name "${PROJECT}-backend-${STAGE}" || true
aws cloudformation delete-stack --region "$AWS_REGION" --stack-name "${PROJECT}-ecr-${STAGE}" || true
echo "Delete requests sent. Check CloudFormation console for completion."
