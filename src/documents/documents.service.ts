import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Document } from '@prisma/client';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async ensureUploadDir() {
    await mkdir(this.getUploadDir(), { recursive: true });
  }

  getUploadDir() {
    return resolve(this.config.get<string>('UPLOAD_DIR', './uploads'));
  }

  async createFromUpload(file: Express.Multer.File, uploadedBy: string): Promise<Document> {
    if (!file) {
      throw new BadRequestException('PDF file is required.');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted.');
    }

    return this.prisma.document.create({
      data: {
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
        uploadedBy,
      },
    });
  }

  async findById(id: string): Promise<Document> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }
    return document;
  }

  async getFilePath(id: string): Promise<string> {
    const document = await this.findById(id);
    const absolutePath = resolve(document.storagePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Stored PDF file is missing from disk.');
    }
    return absolutePath;
  }

  buildStoragePath(filename: string) {
    return join(this.getUploadDir(), filename);
  }
}
