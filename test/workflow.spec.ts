import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const request = require('supertest');

describe('eSign workflow API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await cleanDatabase();
  });

  afterAll(async () => {
    if (prisma) {
      await cleanDatabase();
    }
    if (app) {
      await app.close();
    }
  });

  it('runs the complete backend workflow through HTTP endpoints', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

    const uploadResponse = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('x-user-email', 'role1@example.com')
      .attach('file', pdfBuffer, {
        filename: 'demo.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(uploadResponse.body.id).toBeDefined();
    expect(uploadResponse.body.originalName).toBe('demo.pdf');
    const documentId = uploadResponse.body.id;

    await request(app.getHttpServer()).get(`/documents/${documentId}`).expect(200);
    await request(app.getHttpServer()).get(`/documents/${documentId}/file`).expect(200);

    const workflowResponse = await request(app.getHttpServer())
      .post('/workflows')
      .send({
        documentId,
        role1Email: 'role1@example.com',
        role2Email: 'role2@example.com',
        role3PlaceholderEmail: 'placeholder-role-3@example.invalid',
        note: 'E2E demo workflow',
      })
      .expect(201);

    const workflowId = workflowResponse.body.id;
    expect(workflowId).toBeDefined();
    expect(workflowResponse.body.status).toBe('DRAFT');

    await request(app.getHttpServer())
      .post(`/workflows/${workflowId}/tags`)
      .send({
        tags: [
          {
            role: 'ROLE_2',
            type: 'SIGNATURE',
            page: 1,
            x: 72,
            y: 88,
            width: 220,
            height: 58,
            label: 'Role 2 Signature',
            required: true,
          },
          {
            role: 'ROLE_3',
            type: 'SIGNATURE',
            page: 1,
            x: 72,
            y: 162,
            width: 220,
            height: 58,
            label: 'Role 3 Signature',
            required: true,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer()).post(`/workflows/${workflowId}/submit`).expect(201);

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/status`)
      .expect(200)
      .expect((response: any) => {
        expect(response.body.status).toBe('PENDING_ROLE_2_SIGNATURE');
        expect(response.body.currentSignerRole).toBe('ROLE_2');
      });

    await request(app.getHttpServer())
      .post('/webhooks/docuseal')
      .send({
        event_type: 'form.completed',
        timestamp: '2026-06-16T10:00:00Z',
        data: {
          id: `mock-${workflowId}-role-2`,
          submission: {
            id: `mock-submission-${workflowId}`,
          },
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/workflows/${workflowId}/role-3-email`)
      .send({ email: 'role3@example.com' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/status`)
      .expect(200)
      .expect((response: any) => {
        expect(response.body.status).toBe('PENDING_ROLE_3_SIGNATURE');
        expect(response.body.currentSignerRole).toBe('ROLE_3');
      });

    await request(app.getHttpServer())
      .post('/webhooks/docuseal')
      .send({
        event_type: 'form.completed',
        timestamp: '2026-06-16T10:05:00Z',
        data: {
          id: `mock-${workflowId}-role-3`,
          submission: {
            id: `mock-submission-${workflowId}`,
          },
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/status`)
      .expect(200)
      .expect((response: any) => {
        expect(response.body.status).toBe('COMPLETED');
        expect(response.body.currentSignerRole).toBeNull();
      });

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/signed-document`)
      .expect(200)
      .expect((response: any) => {
        expect(response.body.signedDocumentUrl).toBe(`/workflows/${workflowId}/signed-document/file`);
      });

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/signed-document/file`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}`)
      .expect(200)
      .expect((response: any) => {
        expect(response.body.auditEvents.length).toBeGreaterThanOrEqual(5);
      });
  });

  async function cleanDatabase() {
    await prisma.auditEvent.deleteMany();
    await prisma.eSignSubmission.deleteMany();
    await prisma.signatureTag.deleteMany();
    await prisma.signer.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.document.deleteMany();
  }
});
