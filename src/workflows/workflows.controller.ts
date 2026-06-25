import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AddSignatureTagsDto } from './dto/add-signature-tags.dto';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateRole3EmailDto } from './dto/update-role3-email.dto';
import { WorkflowStatusDto } from './dto/workflow-response.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  @ApiCreatedResponse()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflowsService.createWorkflow(dto);
  }

  @Post(':id/tags')
  @ApiCreatedResponse()
  addTags(@Param('id') id: string, @Body() dto: AddSignatureTagsDto) {
    return this.workflowsService.addSignatureTags(id, dto);
  }

  @Post(':id/submit')
  @ApiOkResponse()
  submit(@Param('id') id: string) {
    return this.workflowsService.submitForSigning(id);
  }

  @Get(':id/status')
  @ApiOkResponse({ type: WorkflowStatusDto })
  getStatus(@Param('id') id: string) {
    return this.workflowsService.getStatus(id);
  }

  @Patch(':id/role-3-email')
  @ApiOkResponse()
  updateRole3Email(@Param('id') id: string, @Body() dto: UpdateRole3EmailDto) {
    return this.workflowsService.updateRole3Email(id, dto.email);
  }

  @Get(':id')
  @ApiOkResponse()
  getWorkflow(@Param('id') id: string) {
    return this.workflowsService.getWorkflow(id);
  }

  @Get(':id/signed-document')
  @ApiOkResponse()
  getSignedDocument(@Param('id') id: string) {
    return this.workflowsService.getSignedDocument(id);
  }

  @Get(':id/signed-document/file')
  async downloadSignedDocument(@Param('id') id: string, @Res() res: Response) {
    const signedDocument = await this.workflowsService.getSignedDocumentFile(id);
    return res.sendFile(signedDocument.path, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${signedDocument.filename}"`,
      },
    });
  }
}
