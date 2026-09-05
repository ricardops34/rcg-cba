import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TitulosReceberService } from './titulos-receber.service';
import { TituloReceberQueryDto } from './dto/titulo-receber.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('titulos-receber')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('titulos-receber')
export class TitulosReceberController {
  constructor(private readonly service: TitulosReceberService) {}

  @ApiOperation({
    summary: 'Listar títulos a receber',
    description:
      'Títulos a receber da empresa ativa (consulta — dados entram pelo import do ERP), ' +
      'restritos ao escopo hierárquico do usuário logado. Busca por número ou razão social do ' +
      'cliente. Requer titulos-receber.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('titulos-receber', 'visualizar')
  @Get()
  findAll(@Query() query: TituloReceberQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Detalhar título',
    description:
      'Requer titulos-receber.visualizar ou posicao-cliente.visualizar — a cortina de detalhe da ' +
      'Posição de Cliente abre esta rota a partir de um título que a própria tela já listou.',
  })
  @RequirePermission('titulos-receber', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: '2ª via do boleto (PDF)',
    description:
      'Reimprime a ficha de compensação do título, a partir do nosso número registrado pelo ERP ' +
      'e do convênio cadastrado em Contas Bancárias. Recusa com 409 quando falta nosso número, ' +
      'conta de cobrança, ou o título já está baixado. É o mesmo arquivo que o atendimento por ' +
      'WhatsApp anexa na conversa. Requer titulos-receber.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 409, description: 'Título sem dados para emitir o boleto' })
  @RequirePermission('titulos-receber', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/boleto')
  async boleto(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { conteudo, nomeArquivo } = await this.service.gerarBoleto(
      user.empresaAtivaId,
      { tipo: 'usuario', user },
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Content-Length': String(conteudo.length),
    });
    return new StreamableFile(conteudo);
  }
}
