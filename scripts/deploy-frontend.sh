#!/usr/bin/env bash
set -euo pipefail
STAGE=${1:-stg}
: "${AWS_REGION:=ap-south-1}"; : "${PROJECT:=movenet}"

aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "${PROJECT}-frontend-${STAGE}" \
  --template-file cfn/frontend-static.yml \
  --parameter-overrides Project="$PROJECT" Stage="$STAGE"

SITE_BUCKET=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-frontend-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-frontend-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
DIST_DOMAIN=$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" --stack-name "${PROJECT}-frontend-${STAGE}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text)

aws s3 sync frontend/ "s3://${SITE_BUCKET}" --delete
aws cloudfront create-invalidation --distribution-id "${DIST_ID}" --paths "/*"
echo "Frontend: https://${DIST_DOMAIN}"
