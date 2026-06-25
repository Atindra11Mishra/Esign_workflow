import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EsignModule } from '../esign/esign.module';
import { SignedPdfService } from './signed-pdf.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [DocumentsModule, EsignModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, SignedPdfService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
