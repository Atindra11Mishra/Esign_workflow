import { Injectable } from '@nestjs/common';
import { SignatureFieldType, SignerRole } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

type SignedPdfWorkflow = {
  id: string;
  document: {
    originalName: string;
    storagePath: string;
  };
  signers: Array<{
    role: SignerRole;
    email: string;
    completedAt: Date | null;
  }>;
  signatureTags: Array<{
    role: SignerRole;
    type: SignatureFieldType;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string | null;
  }>;
};

@Injectable()
export class SignedPdfService {
  async createSignedPdf(workflow: SignedPdfWorkflow): Promise<string> {
    const originalBytes = await readFile(resolve(workflow.document.storagePath));
    const pdfDoc = await this.loadOrCreatePdf(originalBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    for (const tag of workflow.signatureTags) {
      const page = pages[tag.page - 1] || pages[0];
      const signer = workflow.signers.find((item) => item.role === tag.role);
      if (!page || !signer) {
        continue;
      }

      const { height: pageHeight } = page.getSize();
      const x = tag.x;
      const y = pageHeight - tag.y - tag.height;
      const signedAt = signer.completedAt ? signer.completedAt.toISOString() : new Date().toISOString();
      const roleLabel = tag.role === SignerRole.ROLE_2 ? 'Role 2' : 'Role 3';

      page.drawRectangle({
        x,
        y,
        width: tag.width,
        height: tag.height,
        borderColor: rgb(0.05, 0.37, 0.78),
        borderWidth: 1.5,
        color: rgb(0.93, 0.97, 1),
        opacity: 0.95,
      });
      page.drawText(`Signed by ${roleLabel}`, {
        x: x + 8,
        y: y + tag.height - 16,
        size: 10,
        font: boldFont,
        color: rgb(0.05, 0.19, 0.38),
      });
      page.drawText(signer.email, {
        x: x + 8,
        y: y + tag.height - 30,
        size: 8,
        font,
        color: rgb(0.05, 0.19, 0.38),
      });
      page.drawText(signedAt.slice(0, 19).replace('T', ' '), {
        x: x + 8,
        y: y + 8,
        size: 7,
        font,
        color: rgb(0.29, 0.36, 0.45),
      });
    }

    const firstPage = pages[0];
    if (firstPage) {
      const { width } = firstPage.getSize();
      firstPage.drawRectangle({
        x: width - 260,
        y: 690,
        width: 220,
        height: 58,
        borderColor: rgb(0.09, 0.45, 0.22),
        borderWidth: 1.5,
        color: rgb(0.93, 0.98, 0.94),
        opacity: 0.96,
      });
      firstPage.drawText('SIGNED PDF', {
        x: width - 244,
        y: 724,
        size: 14,
        font: boldFont,
        color: rgb(0.09, 0.45, 0.22),
      });
      firstPage.drawText('Role 2 and Role 3 completed', {
        x: width - 244,
        y: 706,
        size: 9,
        font,
        color: rgb(0.05, 0.19, 0.38),
      });
      firstPage.drawText('Completed eSign workflow', {
        x: 36,
        y: 36,
        size: 10,
        font: boldFont,
        color: rgb(0.09, 0.45, 0.22),
      });
      firstPage.drawText(`Workflow ID: ${workflow.id}`, {
        x: width - 260,
        y: 36,
        size: 8,
        font,
        color: rgb(0.29, 0.36, 0.45),
      });
    }

    const outputPath = resolve('uploads', 'signed', `${workflow.id}.pdf`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await pdfDoc.save());
    return outputPath;
  }

  private async loadOrCreatePdf(originalBytes: Buffer) {
    try {
      return await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    } catch {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText('Original PDF could not be parsed, so this signed evidence page was generated.', {
        x: 48,
        y: 720,
        size: 12,
        font,
        color: rgb(0.15, 0.23, 0.33),
      });
      return pdfDoc;
    }
  }
}
