#!/bin/bash

# VARIABLES
SNS_TOPIC_NAME="topic"
SQS_QUEUE_NAME="ab-registry"

# Create SNS Topic or get existing one
SNS_TOPIC_ARN=$(awslocal sns create-topic --name $SNS_TOPIC_NAME --output text --query 'TopicArn')

# Create SQS Queue or get existing one
SQS_QUEUE_URL=$(awslocal sqs create-queue --queue-name $SQS_QUEUE_NAME --output text --query 'QueueUrl')

# Get the Queue ARN
SQS_QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url $SQS_QUEUE_URL --attribute-names QueueArn --output text --query 'Attributes.QueueArn')

# Check if the subscription already exists
SUBSCRIPTION_EXISTS=$(awslocal sns list-subscriptions-by-topic --topic-arn $SNS_TOPIC_ARN --output text --query "Subscriptions[?Endpoint=='$SQS_QUEUE_ARN'].SubscriptionArn")

if [ -z "$SUBSCRIPTION_EXISTS" ]; then
  # Subscribe the SQS Queue to the SNS Topic
  awslocal sns subscribe --topic-arn $SNS_TOPIC_ARN --protocol sqs --notification-endpoint $SQS_QUEUE_ARN
  echo "Subscribed SQS queue to SNS topic."
else
  echo "Subscription already exists."
fi

# Extract endpoint URL for localstack
LOCALSTACK_ENDPOINT="http://localhost:4566"

# Create or update .env.local file
cat <<EOF > .env.local
AWS_SNS_ARN=$SNS_TOPIC_ARN
AWS_SNS_ENDPOINT=$LOCALSTACK_ENDPOINT
AWS_SQS_ENDPOINT=$SQS_QUEUE_URL
EOF

cp .env.local

# Output the created resources
echo ".env.local file created/updated and added to processor and cli."
