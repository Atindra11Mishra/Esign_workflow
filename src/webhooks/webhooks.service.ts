import { BadRequestException, Injectable } from '@nestjs/common';
import { WorkflowsService } from '../workflows/workflows.service';
import { DocusealWebhookDto } from './dto/docuseal-webhook.dto';

@Injectable()
export class WebhooksService {
  constructor(private readonly workflowsService: WorkflowsService) {}

  async handleDocuseal(dto: DocusealWebhookDto) {
    if (dto.event_type === 'form.completed') {
      const submitterId = dto.data.id;
      const submissionId = dto.data.submission?.id;
      if (!submitterId) {
        throw new BadRequestException('DocuSeal form.completed webhook is missing submitter ID.');
      }
      return this.workflowsService.handleSubmitterCompleted(String(submitterId), submissionId ? String(submissionId) : undefined);
    }

    if (dto.event_type === 'submission.completed') {
      const submissionId = dto.data.id;
      if (!submissionId) {
        throw new BadRequestException('DocuSeal submission.completed webhook is missing submission ID.');
      }
      return this.workflowsService.handleSubmissionCompleted(
        String(submissionId),
        dto.data.combined_document_url,
        dto.data.audit_log_url,
      );
    }

    if (dto.event_type === 'form.declined') {
      throw new BadRequestException('Declined signing events are acknowledged by the API but require manual review in this demo.');
    }

    return {
      accepted: true,
      ignored: true,
      eventType: dto.event_type,
    };
  }
}
