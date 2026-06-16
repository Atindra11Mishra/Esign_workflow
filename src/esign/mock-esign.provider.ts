import { Injectable } from '@nestjs/common';
import { CreateSubmissionInput, CreateSubmissionResult, EsignProvider, SignedDocumentResult, UpdateSubmitterEmailInput } from './esign.types';

@Injectable()
export class MockEsignProvider implements EsignProvider {
  async createSubmission(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
    return {
      provider: 'mock-docuseal',
      providerSubmissionId: `mock-submission-${input.workflowId}`,
      submissionUrl: `https://mock.docuseal.local/submissions/${input.workflowId}`,
      role2SubmitterId: `mock-${input.workflowId}-role-2`,
      role3SubmitterId: `mock-${input.workflowId}-role-3`,
      rawResponse: {
        order: 'preserved',
        role3SendEmail: false,
        tagCount: input.tags.length,
      },
    };
  }

  async updateSubmitterEmail(_input: UpdateSubmitterEmailInput): Promise<void> {
    return;
  }

  async getSignedDocuments(providerSubmissionId: string): Promise<SignedDocumentResult> {
    return {
      signedDocumentUrl: `https://mock.docuseal.local/submissions/${providerSubmissionId}/signed.pdf`,
      auditLogUrl: `https://mock.docuseal.local/submissions/${providerSubmissionId}/audit-log.pdf`,
    };
  }
}
