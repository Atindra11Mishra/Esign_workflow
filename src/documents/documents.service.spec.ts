import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  const prisma = {
    document: {
      create: jest.fn(),
    },
  };

  const service = new DocumentsService(prisma as any, new ConfigService());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts PDF uploads and stores metadata', async () => {
    prisma.document.create.mockResolvedValue({ id: 'doc-1' });

    await expect(
      service.createFromUpload(
        {
          originalname: 'contract.pdf',
          filename: 'stored.pdf',
          mimetype: 'application/pdf',
          size: 123,
          path: 'uploads/stored.pdf',
        } as Express.Multer.File,
        'role1@example.com',
      ),
    ).resolves.toEqual({ id: 'doc-1' });

    expect(prisma.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalName: 'contract.pdf',
        uploadedBy: 'role1@example.com',
      }),
    });
  });

  it('rejects non-PDF uploads', async () => {
    await expect(
      service.createFromUpload(
        {
          originalname: 'contract.txt',
          filename: 'stored.txt',
          mimetype: 'text/plain',
          size: 123,
          path: 'uploads/stored.txt',
        } as Express.Multer.File,
        'role1@example.com',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
