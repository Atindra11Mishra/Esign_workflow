import { BadRequestException } from '@nestjs/common';
import { SignatureFieldType, SignerRole, SignerStatus, WorkflowStatus } from '@prisma/client';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
  const documentsService = {
    findById: jest.fn(),
    getFilePath: jest.fn(),
  };

  const esignProvider = {
    createSubmission: jest.fn(),
    updateSubmitterEmail: jest.fn(),
    getSignedDocuments: jest.fn(),
  };

  const signedPdfService = {
    createSignedPdf: jest.fn(),
  };

  const prisma = {
    workflow: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    signatureTag: {
      createMany: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
    eSignSubmission: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    signer: {
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (operations: any[]) => Promise.all(operations)),
  };

  const service = new WorkflowsService(
    prisma as any,
    documentsService as any,
    esignProvider,
    signedPdfService as any,
  );

  const baseWorkflow = {
    id: 'workflow-1',
    documentId: 'doc-1',
    role1Email: 'role1@example.com',
    status: WorkflowStatus.DRAFT,
    currentSignerRole: null,
    document: {
      id: 'doc-1',
      originalName: 'contract.pdf',
    },
    signers: [
      {
        id: 'signer-2',
        role: SignerRole.ROLE_2,
        email: 'role2@example.com',
        status: SignerStatus.AWAITING,
        signingOrder: 1,
        docusealSubmitterId: null,
      },
      {
        id: 'signer-3',
        role: SignerRole.ROLE_3,
        email: 'placeholder-role-3@example.invalid',
        placeholder: true,
        status: SignerStatus.AWAITING,
        signingOrder: 2,
        docusealSubmitterId: null,
      },
    ],
    signatureTags: [
      tag('tag-2', SignerRole.ROLE_2),
      tag('tag-3', SignerRole.ROLE_3),
    ],
    esignSubmission: null,
    auditEvents: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.workflow.findUnique.mockResolvedValue(baseWorkflow);
    prisma.workflow.update.mockResolvedValue({});
    prisma.signer.update.mockResolvedValue({});
    prisma.auditEvent.create.mockResolvedValue({});
    prisma.eSignSubmission.create.mockResolvedValue({});
    documentsService.getFilePath.mockResolvedValue('uploads/contract.pdf');
    esignProvider.createSubmission.mockResolvedValue({
      provider: 'mock-docuseal',
      providerSubmissionId: 'mock-submission-workflow-1',
      role2SubmitterId: 'mock-workflow-1-role-2',
      role3SubmitterId: 'mock-workflow-1-role-3',
    });
    signedPdfService.createSignedPdf.mockResolvedValue('uploads/signed/workflow-1.pdf');
  });

  it('does not submit when Role 3 tags are missing', async () => {
    prisma.workflow.findUnique.mockResolvedValue({
      ...baseWorkflow,
      signatureTags: [tag('tag-2', SignerRole.ROLE_2)],
    });

    await expect(service.submitForSigning('workflow-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submits only complete draft workflows and disables Role 3 email through provider input', async () => {
    await service.submitForSigning('workflow-1');

    expect(esignProvider.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        role2Email: 'role2@example.com',
        role3Email: 'placeholder-role-3@example.invalid',
        tags: expect.arrayContaining([expect.objectContaining({ role: SignerRole.ROLE_3 })]),
      }),
    );
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: {
        status: WorkflowStatus.PENDING_ROLE_2_SIGNATURE,
        currentSignerRole: SignerRole.ROLE_2,
      },
    });
  });

  it('blocks Role 3 email update before Role 2 is completed', async () => {
    await expect(service.updateRole3Email('workflow-1', 'role3@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updates Role 3 email after Role 2 completion and sends the request', async () => {
    prisma.workflow.findUnique.mockResolvedValue({
      ...baseWorkflow,
      status: WorkflowStatus.ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL,
      signers: [
        {
          ...baseWorkflow.signers[0],
          status: SignerStatus.COMPLETED,
          docusealSubmitterId: 'mock-workflow-1-role-2',
        },
        {
          ...baseWorkflow.signers[1],
          docusealSubmitterId: 'mock-workflow-1-role-3',
        },
      ],
      esignSubmission: {
        id: 'submission-1',
        providerSubmissionId: 'mock-submission-workflow-1',
      },
    });

    await service.updateRole3Email('workflow-1', 'role3@example.com');

    expect(esignProvider.updateSubmitterEmail).toHaveBeenCalledWith({
      submitterId: 'mock-workflow-1-role-3',
      email: 'role3@example.com',
    });
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: {
        status: WorkflowStatus.PENDING_ROLE_3_SIGNATURE,
        currentSignerRole: SignerRole.ROLE_3,
      },
    });
  });

  it('moves to waiting-for-role-3-email when Role 2 form webhook completes', async () => {
    prisma.signer.findFirst.mockResolvedValue({
      ...baseWorkflow.signers[0],
      workflowId: 'workflow-1',
      docusealSubmitterId: 'mock-workflow-1-role-2',
      workflow: {
        esignSubmission: {
          providerSubmissionId: 'mock-submission-workflow-1',
        },
      },
    });

    await service.handleSubmitterCompleted('mock-workflow-1-role-2', 'mock-submission-workflow-1');

    expect(prisma.workflow.update).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      data: {
        status: WorkflowStatus.ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL,
        currentSignerRole: SignerRole.ROLE_3,
      },
    });
  });
});

function tag(id: string, role: SignerRole) {
  return {
    id,
    workflowId: 'workflow-1',
    role,
    type: SignatureFieldType.SIGNATURE,
    page: 1,
    x: 100,
    y: 100,
    width: 160,
    height: 48,
    label: null,
    required: true,
    createdAt: new Date(),
  };
}
