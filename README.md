# eSign Workflow Backend

NestJS backend for a sequential eSign workflow assignment. The API manages PDF upload, signature tag metadata, DocuSeal submission orchestration, dynamic Role 3 email replacement after Role 2 signs, audit history, and signed-document retrieval.

## Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- Swagger/OpenAPI at `/api/docs`
- Local PDF storage in `UPLOAD_DIR`
- DocuSeal API integration with mock fallback

## Core Workflow

1. Role 1 uploads a PDF with `POST /documents/upload`.
2. Role 1 creates a workflow with Role 2 email and a Role 3 placeholder email.
3. Role 1 adds signature tags for Role 2 and Role 3.
4. `POST /workflows/:id/submit` creates a DocuSeal submission with preserved order.
5. Role 3 is created with `send_email: false`, so the placeholder cannot receive a signing request.
6. DocuSeal `form.completed` webhook for Role 2 moves the workflow to `ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL`.
7. `PATCH /workflows/:id/role-3-email` updates Role 3 in DocuSeal and re-sends the email.
8. Role 3 signs. `form.completed` or `submission.completed` marks the workflow `COMPLETED`.

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npx prisma migrate dev
npm run start:dev
```

Open Swagger:

```text
http://localhost:3000/api/docs
```

## Minimal Demo UI

A small React/Vite demo UI is available in `frontend/`. Keep the backend running on port `3000`, then start the UI:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

The UI runs the same workflow as Swagger: upload PDF, create workflow, add tags, submit, simulate Role 2 completion, update Role 3 email, simulate Role 3 completion, show audit events, and open the generated signed PDF.

After completion, use **Open signed PDF** in the UI or call:

```text
GET /workflows/{workflowId}/signed-document/file
```

In mock DocuSeal mode, the backend creates a real PDF artifact under `uploads/signed/` with visible Role 2 and Role 3 signature evidence. With a real DocuSeal API key, the provider can be swapped to return the provider-generated signed PDF.

## Environment

```env
DATABASE_URL="postgresql://esign:esign@localhost:5432/esign_workflow?schema=public"
PORT=3000
UPLOAD_DIR="./uploads"
DOCUSEAL_API_URL="https://api.docuseal.com"
DOCUSEAL_API_KEY=""
DOCUSEAL_MOCK_MODE="true"
```

Set `DOCUSEAL_MOCK_MODE=false` and provide `DOCUSEAL_API_KEY` to call the real DocuSeal API.

## API Demo Order

1. `POST /documents/upload`
   - multipart field: `file`
   - header: `x-user-email: role1@example.com`
2. `POST /workflows`
3. `POST /workflows/:id/tags`
4. `POST /workflows/:id/submit`
5. Simulate Role 2 webhook:

```json
{
  "event_type": "form.completed",
  "timestamp": "2026-06-15T10:00:00Z",
  "data": {
    "id": "mock-WORKFLOW_ID-role-2",
    "submission": {
      "id": "mock-submission-WORKFLOW_ID"
    }
  }
}
```

6. `PATCH /workflows/:id/role-3-email`
7. Simulate Role 3 webhook:

```json
{
  "event_type": "form.completed",
  "timestamp": "2026-06-15T10:05:00Z",
  "data": {
    "id": "mock-WORKFLOW_ID-role-3",
    "submission": {
      "id": "mock-submission-WORKFLOW_ID"
    }
  }
}
```

8. `GET /workflows/:id/signed-document`

## Edge Case Decision

DocuSeal supports preserved signer order, per-submitter email sending, submitter updates, and form/submission webhooks. This implementation avoids emailing a placeholder Role 3 address by creating Role 3 in the provider with `send_email: false`. After Role 2 signs, the backend accepts the real Role 3 email, updates the DocuSeal submitter, and re-sends the signing request.

## Tests

```bash
npm test
npm run build
```

The tests cover PDF-only upload validation, required signature tags before submission, Role 3 email sequencing, idempotent Role 3 email update, Role 2/Role 3 completion transitions, and one end-to-end HTTP workflow that calls every required endpoint against PostgreSQL.
