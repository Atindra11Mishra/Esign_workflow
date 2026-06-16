import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { CreateSubmissionInput, CreateSubmissionResult, EsignProvider, SignedDocumentResult, UpdateSubmitterEmailInput } from './esign.types';

@Injectable()
export class DocusealProvider implements EsignProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('DOCUSEAL_API_URL', 'https://api.docuseal.com');
    this.apiKey = this.config.get<string>('DOCUSEAL_API_KEY', '');
  }

  async createSubmission(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
    const file = await readFile(input.documentPath);
    const body = {
      name: `Workflow ${input.workflowId}`,
      order: 'preserved',
      documents: [
        {
          name: input.documentName,
          file: file.toString('base64'),
        },
      ],
      submitters: [
        {
          role: 'ROLE_2',
          email: input.role2Email,
          external_id: `${input.workflowId}:ROLE_2`,
          send_email: true,
          order: 0,
        },
        {
          role: 'ROLE_3',
          email: input.role3Email,
          external_id: `${input.workflowId}:ROLE_3`,
          send_email: false,
          order: 1,
        },
      ],
      fields: input.tags.map((tag) => ({
        name: tag.label || `${tag.role}_${tag.type}_${tag.id}`,
        type: this.mapFieldType(tag.type),
        role: tag.role,
        required: tag.required,
        areas: [
          {
            page: tag.page,
            x: tag.x,
            y: tag.y,
            w: tag.width,
            h: tag.height,
          },
        ],
      })),
    };

    const response = await this.request('/submissions/pdf', 'POST', body);
    const submitters = Array.isArray(response.submitters) ? response.submitters : [];
    const role2 = submitters.find((submitter: any) => submitter.role === 'ROLE_2');
    const role3 = submitters.find((submitter: any) => submitter.role === 'ROLE_3');

    if (!response.id || !role2?.id || !role3?.id) {
      throw new InternalServerErrorException('DocuSeal response did not include expected submission or submitter IDs.');
    }

    return {
      provider: 'docuseal',
      providerSubmissionId: String(response.id),
      submissionUrl: response.submission_url || response.url,
      role2SubmitterId: String(role2.id),
      role3SubmitterId: String(role3.id),
      signedDocumentUrl: response.combined_document_url,
      auditLogUrl: response.audit_log_url,
      rawResponse: response,
    };
  }

  async updateSubmitterEmail(input: UpdateSubmitterEmailInput): Promise<void> {
    await this.request(`/submitters/${input.submitterId}`, 'PUT', {
      email: input.email,
      send_email: true,
    });
  }

  async getSignedDocuments(providerSubmissionId: string): Promise<SignedDocumentResult> {
    const response = await this.request(`/submissions/${providerSubmissionId}/documents?merge=true`, 'GET');
    const firstDocument = Array.isArray(response.documents) ? response.documents[0] : undefined;
    return {
      signedDocumentUrl: response.combined_document_url || firstDocument?.url,
      auditLogUrl: response.audit_log_url,
      rawResponse: response,
    };
  }

  private async request(path: string, method: string, body?: unknown): Promise<any> {
    if (!this.apiKey) {
      throw new InternalServerErrorException('DOCUSEAL_API_KEY is required when mock mode is disabled.');
    }

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new InternalServerErrorException({
        message: 'DocuSeal API request failed.',
        status: response.status,
        payload,
      });
    }
    return payload;
  }

  private mapFieldType(type: string) {
    const map: Record<string, string> = {
      SIGNATURE: 'signature',
      INITIALS: 'initials',
      DATE: 'date',
      TEXT: 'text',
    };
    return map[type] || 'text';
  }
}
