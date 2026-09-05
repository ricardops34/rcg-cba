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
import { NotasSaidaService } from './notas-saida.service';
import { NotaSaidaQueryDto } from './dto/nota-saida.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('notas-saida')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notas-saida')
export class NotasSaidaController {
  constructor(private readonly service: NotasSaidaService) {}

  @ApiOperation({
    summary: 'Listar notas de saída',
    description:
      'Notas fiscais de saída da empresa ativa (consulta — dados entram pelo import do ERP), ' +
      'restritas ao escopo hierárquico do usuário logado. Busca por número, chave NFe ou razão ' +
      'social do cliente. Requer notas-saida.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('notas-saida', 'visualizar')
  @Get()
  findAll(@Query() query: NotaSaidaQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Detalhar nota de saída (com itens)',
    description:
      'Requer notas-saida.visualizar ou posicao-cliente.visualizar — a cortina de detalhe da ' +
      'Posição de Cliente abre esta rota a partir de uma nota que a própria tela já listou.',
  })
  @RequirePermission('notas-saida', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: '2ª via do DANFE (PDF)',
    description:
      'Renderiza o DANFE a partir do XML autorizado que o ERP enviou. Recusa com 409 quando a ' +
      'nota ainda não tem XML na plataforma. É o mesmo arquivo que o atendimento por WhatsApp ' +
      'anexa na conversa. Requer notas-saida.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 409, description: 'Nota sem XML autorizado na plataforma' })
  @RequirePermission('notas-saida', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/danfe')
  async danfe(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { conteudo, nomeArquivo } = await this.service.gerarDanfe(
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

  @ApiOperation({
    summary: 'XML autorizado da NF-e',
    description:
      'O arquivo como veio do ERP — para escrituração e para o contador do cliente. ' +
      'Requer notas-saida.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiProduces('application/xml')
  @ApiResponse({ status: 409, description: 'Nota sem XML autorizado na plataforma' })
  @RequirePermission('notas-saida', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/xml')
  async xml(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { conteudo, nomeArquivo } = await this.service.obterXml(
      user.empresaAtivaId,
      user,
      id,
    );
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Content-Length': String(conteudo.length),
    });
    return new StreamableFile(conteudo);
  }
}
