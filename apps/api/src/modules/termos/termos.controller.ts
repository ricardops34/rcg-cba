import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PermitirTermoPendente } from '../../common/decorators/permitir-termo-pendente.decorator';
import { TermoAceiteDto } from './dto/termo.dto';
import { TermosService } from './termos.service';

@ApiTags('termos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('termos')
export class TermosController {
  constructor(private readonly termos: TermosService) {}

  @ApiOperation({
    summary: 'Situação dos termos do usuário autenticado',
    description:
      'Lista documentos obrigatórios pendentes e o histórico de versões já aceitas.',
  })
  @ApiResponse({ status: 200, description: 'Situação atual dos termos' })
  @PermitirTermoPendente()
  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.termos.status(user.id);
  }

  @ApiOperation({
    summary: 'Aceitar uma versão vigente',
    description:
      'Registra usuário, empresa de contexto, data do servidor, IP, navegador e hash do conteúdo.',
  })
  @ApiResponse({ status: 201, description: 'Aceite registrado' })
  @ApiResponse({
    status: 409,
    description: 'O conteúdo exibido deixou de ser o vigente',
  })
  @PermitirTermoPendente()
  @Post(':id/aceite')
  aceitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TermoAceiteDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.termos.aceitar(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
