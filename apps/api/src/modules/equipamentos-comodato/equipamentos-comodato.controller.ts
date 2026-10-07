import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { EquipamentosComodatoService } from './equipamentos-comodato.service';
import {
  EquipamentoAplicacaoCriarDto,
  EquipamentoComodatoCriarDto,
  EquipamentoComodatoEditarDto,
  EquipamentoComodatoQueryDto,
} from './dto/equipamento-comodato.dto';

@ApiTags('equipamentos-comodato')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('equipamentos-comodato')
export class EquipamentosComodatoController {
  constructor(private readonly service: EquipamentosComodatoService) {}

  @ApiOperation({
    summary: 'Listar equipamentos de comodato',
    description:
      'Produtos que podem ser comodatados, com quantos produtos aplicáveis e ' +
      'quantos clientes já receberam cada um. Requer equipamentos-comodato.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('equipamentos-comodato', 'visualizar')
  @Get()
  findAll(
    @Query() query: EquipamentoComodatoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  // Antes de ':id', senão o Nest leria "popular" como id.
  @ApiOperation({
    summary: 'Popular pelas notas de comodato',
    description:
      'Cadastra como equipamento todo produto que já saiu em remessa de ' +
      'comodato (CFOP 5908/6908). Não mexe no que já está cadastrado, nem no ' +
      'excluído. Requer equipamentos-comodato.importar.',
  })
  @RequirePermission('equipamentos-comodato', 'importar')
  @Post('popular')
  popular(@CurrentUser() user: AuthenticatedUser) {
    return this.service.popular(user.empresaAtivaId, user.id);
  }

  @ApiOperation({
    summary: 'Detalhar equipamento (com os produtos aplicáveis)',
    description: 'Requer equipamentos-comodato.visualizar.',
  })
  @RequirePermission('equipamentos-comodato', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Sugestões de produtos aplicáveis',
    description:
      'Produtos que os clientes com este equipamento compram acima da média ' +
      '(compra conjunta, últimos 24 meses). Só leitura: nada é gravado. ' +
      'Requer equipamentos-comodato.visualizar.',
  })
  @RequirePermission('equipamentos-comodato', 'visualizar')
  @Get(':id/sugestoes')
  sugestoes(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.sugestoes(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar equipamento',
    description:
      'Um produto excluído antes volta com as aplicações que tinha. ' +
      'Requer equipamentos-comodato.cadastrar.',
  })
  @RequirePermission('equipamentos-comodato', 'cadastrar')
  @Post()
  create(
    @Body() dto: EquipamentoComodatoCriarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Editar equipamento (observação, ativo)',
    description: 'Requer equipamentos-comodato.editar.',
  })
  @RequirePermission('equipamentos-comodato', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: EquipamentoComodatoEditarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user.id, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir equipamento',
    description:
      'Exclusão lógica. Os produtos aplicáveis continuam no produto (card ' +
      '"Relacionados"). Requer equipamentos-comodato.excluir.',
  })
  @RequirePermission('equipamentos-comodato', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user.id, id);
  }

  @ApiOperation({
    summary: 'Adicionar produto aplicável',
    description:
      'Grava a relação de aplicação do equipamento com o produto. Requer ' +
      'equipamentos-comodato.editar.',
  })
  @RequirePermission('equipamentos-comodato', 'editar')
  @Post(':id/aplicacoes')
  adicionarAplicacao(
    @Param('id') id: string,
    @Body() dto: EquipamentoAplicacaoCriarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.adicionarAplicacao(
      user.empresaAtivaId,
      user.id,
      id,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Remover produto aplicável',
    description: 'Requer equipamentos-comodato.editar.',
  })
  @RequirePermission('equipamentos-comodato', 'editar')
  @Delete(':id/aplicacoes/:relacaoId')
  removerAplicacao(
    @Param('id') id: string,
    @Param('relacaoId') relacaoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removerAplicacao(user.empresaAtivaId, id, relacaoId);
  }
}
