# AWS Email Notification Setup Guide

## 🎯 Complete Email Automation System

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMAIL AUTOMATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1️⃣ LEAD CREATED                                                │
│     Website → MongoDB → Lambda → SES → Admin Email              │
│                                                                  │
│  2️⃣ SITE VISIT SCHEDULED                                        │
│     Backend → Lambda → SES → Customer Email + Calendar Invite   │
│                      → SES → Admin Email                        │
│                                                                  │
│  3️⃣ REMINDER (1 Day Before)                                     │
│     EventBridge (8AM IST) → Lambda → MongoDB → SES → Customer   │
│                                                                  │
│  4️⃣ REMINDER (Same Day)                                         │
│     EventBridge (8AM IST) → Lambda → MongoDB → SES → Customer   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Files Structure

```
aws-lambda/
├── lead-email-notification/     # Main email Lambda
│   ├── index.js                 # Handles all email types
│   └── package.json
└── reminder-scheduler/          # Daily reminder Lambda
    ├── index.js                 # Checks MongoDB for reminders
    └── package.json
```

## 🚀 Quick Setup (45 minutes)

### Step 1: Set Up AWS SES (Simple Email Service)

1. Go to AWS SES Console → https://console.aws.amazon.com/ses/
2. Verify Your Email Domain or Address:
   - For testing: Verify a single email address
   - For production: Verify your domain (e.g., `jkconstruction.com`)

```
SES Console → Verified Identities → Create identity
```

3. Request Production Access (if in sandbox mode):
   - By default, SES is in sandbox mode (can only send to verified emails)
   - Request production access to send to any email

### Step 2: Create Lambda Function

1. Go to AWS Lambda Console → https://console.aws.amazon.com/lambda/
2. Create Function:
   - Click "Create function"
   - Choose "Author from scratch"
   - Function name: `lead-email-notification`
   - Runtime: `Node.js 18.x` or `Node.js 20.x`
   - Architecture: `x86_64`
   - Click "Create function"

3. Upload Code:

```bash
# In the aws-lambda/lead-email-notification folder:
cd aws-lambda/lead-email-notification
npm install
zip -r function.zip index.js node_modules package.json

# Upload via AWS CLI:
aws lambda update-function-code \
  --function-name lead-email-notification \
  --zip-file fileb://function.zip
```

OR manually:
- Copy the code from `aws-lambda/lead-email-notification/index.js`
- Paste in Lambda console code editor

4. Configure Environment Variables:
   - Go to Configuration → Environment variables
   - Add:
```
SES_FROM_EMAIL = notifications@jkconstruction.com (your verified email)
COMPANY_NAME = JK Construction
COMPANY_PHONE = +91 98765 43210
REGION = ap-south-1 (or your preferred region)
```

5. Set IAM Permissions:
   - Go to Configuration → Permissions
   - Click on the execution role
   - Add inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 3: Create API Gateway

1. Go to API Gateway Console → https://console.aws.amazon.com/apigateway/
2. Create REST API:
   - Click "Create API"
   - Choose "REST API" (not private)
   - API name: `lead-notifications-api`
   - Click "Create API"

3. Create Resource and Method:
   - Actions → Create Resource
   - Resource name: `send-email`
   - Click "Create Resource"
   - With `/send-email` selected:
     - Actions → Create Method → POST
     - Integration type: Lambda Function
     - Lambda Function: `lead-email-notification`
     - Click "Save"

4. Enable API Key Authentication:
   - Click on POST method
   - Method Request → API Key Required → Set to `true`

5. Create API Key:
   - Left menu → API Keys
   - Actions → Create API Key
   - Name: `jk-construction-backend`
   - Click "Save"
   - Copy the API Key value!

6. Create Usage Plan:
   - Left menu → Usage Plans
   - Create → Name: `lead-notifications-plan`
   - Throttling: 100 requests/second
   - Quota: 10000 requests/month
   - Click "Next"
   - Add API Stage (after deploying)
   - Add API Key

7. Deploy API:
   - Actions → Deploy API
   - Stage name: `prod`
   - Click "Deploy"
   - Note the Invoke URL!

### Step 4: Configure Backend

Add these environment variables to your `.env` file:

```env
# AWS Email Notification Service
AWS_EMAIL_API_ENDPOINT=https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod/send-email
AWS_EMAIL_API_KEY=your-api-key-here
LEAD_NOTIFICATION_EMAIL=admin@jkconstruction.com
COMPANY_NAME=JK Construction
```

### Step 5: Test the Integration

1. Test Lambda directly:
```bash
aws lambda invoke \
  --function-name lead-email-notification \
  --payload '{"type":"TEST","to":"your@email.com","subject":"Test"}' \
  response.json
```

2. Test via API Gateway:
```bash
curl -X POST \
  "https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod/send-email" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "type": "TEST",
    "to": "your@email.com",
    "subject": "Test Email"
  }'
```

3. Create a lead in your app and check if email arrives!

## 📅 Step 6: Set Up Reminder Scheduler (EventBridge)

This Lambda runs daily at 8 AM IST to send reminders.

### Create the Reminder Lambda:

1. Create new Lambda function:
   - Function name: `reminder-scheduler`
   - Runtime: `Node.js 18.x`
   - Upload code from `aws-lambda/reminder-scheduler/`

2. Environment Variables:
```
MONGODB_URI = your-mongodb-connection-string
EMAIL_API_ENDPOINT = https://xxx.execute-api.ap-south-1.amazonaws.com/prod/send-email
EMAIL_API_KEY = your-api-key
COMPANY_NAME = JK Construction
```

3. IAM Permissions - Add to execution role:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:*"],
      "Resource": "*"
    }
  ]
}
```

4. Set Timeout: Configuration → General → Timeout: 1 minute

### Create EventBridge Schedule:

1. Go to EventBridge → https://console.aws.amazon.com/events/
2. Create Rule:
   - Name: `daily-reminder-schedule`
   - Rule type: `Schedule`
   - Schedule pattern: `cron(30 2 * * ? *)` ← This is 8 AM IST (2:30 AM UTC)
   - Target: Lambda function → `reminder-scheduler`

3. Done! Reminders will be sent automatically every day at 8 AM IST.

## 💰 Cost Estimation

| Service | Free Tier | Cost After Free Tier |
|---------|-----------|---------------------|
| Lambda | 1M requests/month | $0.20 per 1M requests |
| API Gateway | 1M requests/month | $3.50 per 1M requests |
| SES | 62,000 emails/month (from EC2) | $0.10 per 1,000 emails |
| EventBridge | Free | Free for scheduled rules |

**For ~1000 leads/month: Essentially FREE within AWS Free Tier!**

## 📧 Email Types Supported

| Type | Description | Triggered By | Recipient |
|------|-------------|--------------|-----------|
| NEW_LEAD | Lead details notification | Lead created | Admin |
| SITE_VISIT_SCHEDULED | Confirmation + Calendar (.ics) | Visit scheduled | Customer + Admin |
| REMINDER_1_DAY | 1 day reminder | Daily scheduler (8 AM) | Customer |
| REMINDER_TODAY | Same day reminder | Daily scheduler (8 AM) | Customer |
| LEAD_STATUS_UPDATE | Status change | Status changed | Admin |
| TEST | Test connection | Manual | Specified |

## 🔧 Troubleshooting

### Email not sending?

1. Check Lambda logs:
```bash
aws logs tail /aws/lambda/lead-email-notification --follow
```

2. Check SES sending stats:
   - SES Console → Sending Statistics

3. Common issues:
   - SES in sandbox mode (can only send to verified emails)
   - IAM permissions missing
   - API Key not attached to Usage Plan
   - Wrong API endpoint URL

### API Gateway returning 403?

- Ensure API Key is sent in `x-api-key` header
- Ensure API Key is attached to Usage Plan
- Ensure Usage Plan has the API stage attached

### Calendar invite not showing?

- Check customer has a valid email in the lead record
- Verify SES SendRawEmail permission is enabled

## 🔐 Security Best Practices

1. ✅ Use API Key authentication (implemented)
2. ✅ Use HTTPS only (API Gateway default)
3. ✅ Limit Lambda execution role to SES only
4. ✅ Set up Usage Plan quotas to prevent abuse
5. ✅ Don't expose API Key in frontend code
6. ✅ Use VPC for MongoDB access (optional but recommended)

## 🔗 Integration with Backend

To send emails from your Node.js backend, use the AWS email client service:

```javascript
// Example usage in your backend
const awsEmailService = require('./services/awsEmail.service');

// Send new lead notification
await awsEmailService.sendNewLeadEmail(lead, adminEmail);

// Send site visit confirmation
await awsEmailService.sendSiteVisitEmail(lead, siteVisit, property, adminEmail);
```

See `app-backend/src/services/awsEmail.service.js` for the integration code.
