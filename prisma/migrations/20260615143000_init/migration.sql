CREATE TYPE "WorkflowStatus" AS ENUM (
  'DRAFT',
  'PENDING_ROLE_2_SIGNATURE',
  'ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL',
  'PENDING_ROLE_3_SIGNATURE',
  'COMPLETED',
  'DECLINED',
  'FAILED'
);

CREATE TYPE "SignerRole" AS ENUM ('ROLE_2', 'ROLE_3');

CREATE TYPE "SignerStatus" AS ENUM ('AWAITING', 'SENT', 'COMPLETED', 'DECLINED');

CREATE TYPE "SignatureFieldType" AS ENUM ('SIGNATURE', 'INITIALS', 'DATE', 'TEXT');

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "role1Email" TEXT NOT NULL,
  "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
  "currentSignerRole" "SignerRole",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Signer" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "role" "SignerRole" NOT NULL,
  "email" TEXT NOT NULL,
  "placeholder" BOOLEAN NOT NULL DEFAULT false,
  "status" "SignerStatus" NOT NULL DEFAULT 'AWAITING',
  "signingOrder" INTEGER NOT NULL,
  "docusealSubmitterId" TEXT,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Signer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SignatureTag" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "role" "SignerRole" NOT NULL,
  "type" "SignatureFieldType" NOT NULL,
  "page" INTEGER NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "width" DOUBLE PRECISION NOT NULL,
  "height" DOUBLE PRECISION NOT NULL,
  "label" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ESignSubmission" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerSubmissionId" TEXT NOT NULL,
  "submissionUrl" TEXT,
  "signedDocumentUrl" TEXT,
  "auditLogUrl" TEXT,
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ESignSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Signer_workflowId_role_key" ON "Signer"("workflowId", "role");
CREATE UNIQUE INDEX "ESignSubmission_workflowId_key" ON "ESignSubmission"("workflowId");

ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Signer" ADD CONSTRAINT "Signer_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignatureTag" ADD CONSTRAINT "SignatureTag_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ESignSubmission" ADD CONSTRAINT "ESignSubmission_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
