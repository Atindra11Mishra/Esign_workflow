import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DocusealWebhookDto } from './dto/docuseal-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('docuseal')
  @ApiOkResponse()
  handleDocuseal(@Body() dto: DocusealWebhookDto) {
    return this.webhooksService.handleDocuseal(dto);
  }
}
