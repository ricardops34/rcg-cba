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
import { createZodDto } from 'nestjs-zod';
import {
  vendedorRegiaoCreateSchema,
  vendedorRegiaoMunicipioQuerySchema,
  vendedorRegiaoUpdateSchema,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { VendedorRegioesService } from './vendedor-regioes.service';

class VendedorRegiaoCreateDto extends createZodDto(
  vendedorRegiaoCreateSchema,
) {}
class VendedorRegiaoUpdateDto extends createZodDto(
  vendedorRegiaoUpdateSchema,
) {}
class VendedorRegiaoMunicipioQueryDto extends createZodDto(
  vendedorRegiaoMunicipioQuerySchema,
) {}

/**
 * Gerencial > Vendedores > Regiões de atuação (20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md). Mesmas permissões do
 * cadastro de vendedores.
 */
@ApiTags('vendedor-regioes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendedor-regioes')
export class VendedorRegioesController {
  constructor(private readonly service: VendedorRegioesService) {}

  @ApiOperation({
    summary: 'Listar regiões de atuação',
    description:
      'Áreas desenhadas e municípios, com o dono (ou livre). Requer vendedores.visualizar.',
  })
  @RequirePermission('vendedores', 'visualizar')
  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listar(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Clientes em região de outro vendedor (invasão)',
    description:
      'Clientes ativos da carteira de um vendedor que estão dentro da região de outro, e o ' +
      'resumo por vendedor. Requer vendedores.visualizar.',
  })
  @RequirePermission('vendedores', 'visualizar')
  @Get('invasoes')
  invasoes(@CurrentUser() user: AuthenticatedUser) {
    return this.service.invasoes(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Municípios para região',
    description:
      'Busca na tabela de referência, por UF e nome. Requer vendedores.visualizar.',
  })
  @RequirePermission('vendedores', 'visualizar')
  @Get('municipios')
  municipios(@Query() q: VendedorRegiaoMunicipioQueryDto) {
    return this.service.municipios(q);
  }

  @ApiOperation({
    summary: 'Criar região',
    description:
      'Área desenhada (polígono) ou município inteiro — a divisa vem do IBGE. Sem vendedor é ' +
      'região livre. Requer vendedores.editar.',
  })
  @RequirePermission('vendedores', 'editar')
  @Post()
  criar(
    @Body() dto: VendedorRegiaoCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.criar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar região',
    description: 'Nome, dono e, na área, o desenho. Requer vendedores.editar.',
  })
  @RequirePermission('vendedores', 'editar')
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: VendedorRegiaoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizar(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir região',
    description: 'Requer vendedores.editar.',
  })
  @RequirePermission('vendedores', 'editar')
  @Delete(':id')
  remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remover(user.empresaAtivaId, user, id);
  }
}
