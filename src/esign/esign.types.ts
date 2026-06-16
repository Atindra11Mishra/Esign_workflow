import { SignatureFieldType, SignerRole } from '@prisma/client';

export interface CreateSubmissionInput {
  workflowId: string;
  documentName: string;
  documentPath: string;
  role2Email: string;
  role3Email: string;
  tags: Array<{
    id: string;
    role: SignerRole;
    type: SignatureFieldType;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string | null;
    required: boolean;
  }>;
}

export interface CreateSubmissionResult {
  provider: string;
  providerSubmissionId: string;
  submissionUrl?: string;
  role2SubmitterId: string;
  role3SubmitterId: string;
  signedDocumentUrl?: string;
  auditLogUrl?: string;
  rawResponse?: unknown;
}

export interface UpdateSubmitterEmailInput {
  submitterId: string;
  email: string;
}

export interface SignedDocumentResult {
  signedDocumentUrl?: string;
  auditLogUrl?: string;
  rawResponse?: unknown;
}

export interface EsignProvider {
  createSubmission(input: CreateSubmissionInput): Promise<CreateSubmissionResult>;
  updateSubmitterEmail(input: UpdateSubmitterEmailInput): Promise<void>;
  getSignedDocuments(providerSubmissionId: string): Promise<SignedDocumentResult>;
}
