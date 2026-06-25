import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SignerRole, SignerStatus, WorkflowStatus } from '@prisma/client';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { DOCUSEAL_PROVIDER } from '../common/constants';
import { DocumentsService } from '../documents/documents.service';
import { EsignProvider } from '../esign/esign.types';
import { PrismaService } from '../prisma/prisma.service';
import { AddSignatureTagsDto } from './dto/add-signature-tags.dto';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { SignedPdfService } from './signed-pdf.service';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    @Inject(DOCUSEAL_PROVIDER) private readonly esignProvider: EsignProvider,
    private readonly signedPdfService: SignedPdfService,
  ) {}

  async createWorkflow(dto: CreateWorkflowDto) {
    await this.documentsService.findById(dto.documentId);
    const role3Email = dto.role3PlaceholderEmail || 'placeholder-role-3@example.invalid';

    return this.prisma.workflow.create({
      data: {
        documentId: dto.documentId,
        role1Email: dto.role1Email,
        status: WorkflowStatus.DRAFT,
        signers: {
          create: [
            {
              role: SignerRole.ROLE_2,
              email: dto.role2Email,
              signingOrder: 1,
            },
            {
              role: SignerRole.ROLE_3,
              email: role3Email,
              placeholder: true,
              signingOrder: 2,
            },
          ],
        },
        auditEvents: {
          create: {
            eventType: 'workflow.created',
            message: 'Workflow created by Role 1.',
            metadata: { role1Email: dto.role1Email, note: dto.note },
          },
        },
      },
      include: this.workflowInclude(),
    });
  }

  async addSignatureTags(workflowId: string, dto: AddSignatureTagsDto) {
    const workflow = await this.findWorkflow(workflowId);
    if (workflow.status !== WorkflowStatus.DRAFT) {
      throw new BadRequestException('Signature tags can only be changed while workflow is in DRAFT.');
    }

    const created = await this.prisma.signatureTag.createMany({
      data: dto.tags.map((tag) => ({
        workflowId,
        role: tag.role,
        type: tag.type,
        page: tag.page,
        x: tag.x,
        y: tag.y,
        width: tag.width,
        height: tag.height,
        label: tag.label,
        required: tag.required ?? true,
      })),
    });

    await this.audit(workflowId, 'signature_tags.added', `${created.count} signature tag(s) added.`, {
      count: created.count,
    });

    return this.getWorkflow(workflowId);
  }

  async submitForSigning(workflowId: string) {
    const workflow = await this.findWorkflow(workflowId);
    if (workflow.status !== WorkflowStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT workflows can be submitted for signing.');
    }

    const role2 = workflow.signers.find((signer) => signer.role === SignerRole.ROLE_2);
    const role3 = workflow.signers.find((signer) => signer.role === SignerRole.ROLE_3);
    const hasRole2Tag = workflow.signatureTags.some((tag) => tag.role === SignerRole.ROLE_2);
    const hasRole3Tag = workflow.signatureTags.some((tag) => tag.role === SignerRole.ROLE_3);

    if (!role2 || !role3 || !hasRole2Tag || !hasRole3Tag) {
      throw new BadRequestException('Workflow requires Role 2 and Role 3 signers and tags before submission.');
    }

    const documentPath = await this.documentsService.getFilePath(workflow.documentId);
    const submission = await this.esignProvider.createSubmission({
      workflowId,
      documentName: workflow.document.originalName,
      documentPath,
      role2Email: role2.email,
      role3Email: role3.email,
      tags: workflow.signatureTags,
    });

    await this.prisma.$transaction([
      this.prisma.eSignSubmission.create({
        data: {
          workflowId,
          provider: submission.provider,
          providerSubmissionId: submission.providerSubmissionId,
          submissionUrl: submission.submissionUrl,
          signedDocumentUrl: submission.signedDocumentUrl,
          auditLogUrl: submission.auditLogUrl,
          rawResponse: submission.rawResponse as any,
        },
      }),
      this.prisma.signer.update({
        where: { id: role2.id },
        data: { status: SignerStatus.SENT, docusealSubmitterId: submission.role2SubmitterId },
      }),
      this.prisma.signer.update({
        where: { id: role3.id },
        data: { status: SignerStatus.AWAITING, docusealSubmitterId: submission.role3SubmitterId },
      }),
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.PENDING_ROLE_2_SIGNATURE,
          currentSignerRole: SignerRole.ROLE_2,
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          workflowId,
          eventType: 'workflow.submitted',
          message: 'Workflow submitted to eSign provider. Role 3 email sending is disabled until Role 2 completes.',
          metadata: { provider: submission.provider, providerSubmissionId: submission.providerSubmissionId },
        },
      }),
    ]);

    return this.getWorkflow(workflowId);
  }

  async updateRole3Email(workflowId: string, email: string) {
    const workflow = await this.findWorkflow(workflowId);
    if (workflow.status !== WorkflowStatus.ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL) {
      throw new BadRequestException('Role 3 email can only be updated after Role 2 has completed signing.');
    }

    const role3 = workflow.signers.find((signer) => signer.role === SignerRole.ROLE_3);
    if (!role3?.docusealSubmitterId) {
      throw new BadRequestException('Role 3 submitter has not been created with the eSign provider.');
    }

    if (role3.email === email && !role3.placeholder) {
      return this.getWorkflow(workflowId);
    }

    await this.esignProvider.updateSubmitterEmail({
      submitterId: role3.docusealSubmitterId,
      email,
    });

    await this.prisma.$transaction([
      this.prisma.signer.update({
        where: { id: role3.id },
        data: {
          email,
          placeholder: false,
          status: SignerStatus.SENT,
        },
      }),
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.PENDING_ROLE_3_SIGNATURE,
          currentSignerRole: SignerRole.ROLE_3,
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          workflowId,
          eventType: 'role3.email_updated',
          message: 'Role 3 email was updated and the signing request was sent.',
          metadata: { email },
        },
      }),
    ]);

    return this.getWorkflow(workflowId);
  }

  async handleSubmitterCompleted(providerSubmitterId: string, providerSubmissionId?: string) {
    const signer = await this.prisma.signer.findFirst({
      where: { docusealSubmitterId: providerSubmitterId },
      include: { workflow: { include: { esignSubmission: true } } },
    });
    if (!signer) {
      throw new NotFoundException('Submitter is not mapped to a local workflow.');
    }

    if (
      providerSubmissionId &&
      signer.workflow.esignSubmission?.providerSubmissionId !== providerSubmissionId
    ) {
      throw new BadRequestException('Webhook submission ID does not match local workflow.');
    }

    if (signer.status === SignerStatus.COMPLETED) {
      return this.getWorkflow(signer.workflowId);
    }

    if (signer.role === SignerRole.ROLE_2) {
      await this.prisma.$transaction([
        this.prisma.signer.update({
          where: { id: signer.id },
          data: { status: SignerStatus.COMPLETED, completedAt: new Date() },
        }),
        this.prisma.workflow.update({
          where: { id: signer.workflowId },
          data: {
            status: WorkflowStatus.ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL,
            currentSignerRole: SignerRole.ROLE_3,
          },
        }),
        this.prisma.auditEvent.create({
          data: {
            workflowId: signer.workflowId,
            eventType: 'role2.completed',
            message: 'Role 2 completed signing. Workflow is waiting for the real Role 3 email.',
            metadata: { providerSubmitterId },
          },
        }),
      ]);
    } else {
      await this.markWorkflowCompleted(signer.workflowId, providerSubmitterId);
    }

    return this.getWorkflow(signer.workflowId);
  }

  async handleSubmissionCompleted(providerSubmissionId: string, signedDocumentUrl?: string, auditLogUrl?: string) {
    const submission = await this.prisma.eSignSubmission.findFirst({
      where: { providerSubmissionId },
    });
    if (!submission) {
      throw new NotFoundException('Submission is not mapped to a local workflow.');
    }

    await this.markWorkflowCompleted(submission.workflowId, providerSubmissionId, signedDocumentUrl, auditLogUrl);
    return this.getWorkflow(submission.workflowId);
  }

  async getSignedDocument(workflowId: string) {
    const workflow = await this.findWorkflow(workflowId);
    if (!workflow.esignSubmission) {
      throw new NotFoundException('Workflow has not been submitted to an eSign provider.');
    }

    if (workflow.esignSubmission.signedDocumentUrl || workflow.status !== WorkflowStatus.COMPLETED) {
      return {
        workflowId,
        status: workflow.status,
        signedDocumentUrl: workflow.esignSubmission.signedDocumentUrl,
        auditLogUrl: workflow.esignSubmission.auditLogUrl,
      };
    }

    const signed = await this.esignProvider.getSignedDocuments(workflow.esignSubmission.providerSubmissionId);
    await this.prisma.eSignSubmission.update({
      where: { id: workflow.esignSubmission.id },
      data: {
        signedDocumentUrl: signed.signedDocumentUrl,
        auditLogUrl: signed.auditLogUrl,
        rawResponse: signed.rawResponse as any,
      },
    });

    return {
      workflowId,
      status: workflow.status,
      signedDocumentUrl: signed.signedDocumentUrl,
      auditLogUrl: signed.auditLogUrl,
    };
  }

  async getSignedDocumentFile(workflowId: string) {
    const workflow = await this.findWorkflow(workflowId);
    if (workflow.status !== WorkflowStatus.COMPLETED) {
      throw new BadRequestException('Signed PDF is available only after workflow completion.');
    }
    if (!workflow.esignSubmission?.signedDocumentUrl) {
      await this.ensureLocalSignedPdf(workflowId);
    }

    const refreshed = await this.findWorkflow(workflowId);
    const filename = `${workflowId}.pdf`;
    const signedPdfPath = resolve('uploads', 'signed', filename);
    if (!existsSync(signedPdfPath)) {
      await this.ensureLocalSignedPdf(workflowId, refreshed);
    }

    return {
      path: signedPdfPath,
      filename,
    };
  }

  async getStatus(workflowId: string) {
    const workflow = await this.findWorkflow(workflowId);
    return {
      id: workflow.id,
      status: workflow.status,
      currentSignerRole: workflow.currentSignerRole,
    };
  }

  async getWorkflow(workflowId: string) {
    return this.findWorkflow(workflowId);
  }

  private async markWorkflowCompleted(
    workflowId: string,
    providerReference: string,
    signedDocumentUrl?: string,
    auditLogUrl?: string,
  ) {
    const workflow = await this.findWorkflow(workflowId);
    const role3 = workflow.signers.find((signer) => signer.role === SignerRole.ROLE_3);
    if (!role3) {
      throw new BadRequestException('Role 3 signer is missing.');
    }

    const signedDocumentPath = await this.ensureLocalSignedPdf(workflowId, workflow);
    const localSignedDocumentUrl = `/workflows/${workflowId}/signed-document/file`;

    await this.prisma.$transaction([
      this.prisma.signer.update({
        where: { id: role3.id },
        data: { status: SignerStatus.COMPLETED, completedAt: new Date() },
      }),
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.COMPLETED,
          currentSignerRole: null,
          completedAt: new Date(),
        },
      }),
      ...(workflow.esignSubmission
        ? [
            this.prisma.eSignSubmission.update({
              where: { id: workflow.esignSubmission.id },
              data: {
                signedDocumentUrl: localSignedDocumentUrl || signedDocumentPath,
                auditLogUrl,
              },
            }),
          ]
        : []),
      this.prisma.auditEvent.create({
        data: {
          workflowId,
          eventType: 'workflow.completed',
          message: 'Workflow completed after Role 3 signing and signed PDF was generated.',
          metadata: { providerReference, signedDocumentUrl: localSignedDocumentUrl },
        },
      }),
    ]);
  }

  private async ensureLocalSignedPdf(workflowId: string, existingWorkflow?: Awaited<ReturnType<WorkflowsService['findWorkflow']>>) {
    const workflow = existingWorkflow || (await this.findWorkflow(workflowId));
    const signedPath = await this.signedPdfService.createSignedPdf(workflow);

    if (workflow.esignSubmission) {
      await this.prisma.eSignSubmission.update({
        where: { id: workflow.esignSubmission.id },
        data: {
          signedDocumentUrl: `/workflows/${workflowId}/signed-document/file`,
        },
      });
    }

    return signedPath;
  }

  private async findWorkflow(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: this.workflowInclude(),
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }
    return workflow;
  }

  private async audit(workflowId: string, eventType: string, message: string, metadata?: Record<string, unknown>) {
    await this.prisma.auditEvent.create({
      data: { workflowId, eventType, message, metadata: metadata as any },
    });
  }

  private workflowInclude() {
    return {
      document: true,
      signers: { orderBy: { signingOrder: 'asc' as const } },
      signatureTags: { orderBy: { createdAt: 'asc' as const } },
      esignSubmission: true,
      auditEvents: { orderBy: { createdAt: 'asc' as const } },
    };
  }
}
