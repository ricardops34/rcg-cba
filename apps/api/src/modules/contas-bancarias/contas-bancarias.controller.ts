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
import { ContasBancariasService } from './contas-bancarias.service';
import {
  ContaBancariaCreateDto,
  ContaBancariaQueryDto,
  ContaBancariaUpdateDto,
} from './dto/conta-bancaria.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('contas-bancarias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('contas-bancarias')
export class ContasBancariasController {
  constructor(private readonly service: ContasBancariasService) {}

  @ApiOperation({
    summary: 'Listar contas bancárias',
    description:
      'Convênios de cobrança da empresa ativa — insumo da 2ª via de boleto. ' +
      'Requer contas-bancarias.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('contas-bancarias', 'visualizar')
  @Get()
  findAll(
    @Query() query: ContaBancariaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar conta bancária',
    description: 'Requer contas-bancarias.visualizar.',
  })
  @RequirePermission('contas-bancarias', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar conta bancária',
    description:
      'Agência, conta e carteira entram no código de barras do boleto — valor errado aqui ' +
      'gera boleto que o banco recusa. Requer contas-bancarias.cadastrar.',
  })
  @RequirePermission('contas-bancarias', 'cadastrar')
  @Post()
  create(
    @Body() dto: ContaBancariaCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar conta bancária',
    description: 'Requer contas-bancarias.editar.',
  })
  @RequirePermission('contas-bancarias', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ContaBancariaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir conta bancária (soft delete)',
    description:
      'Os títulos que apontam para a conta continuam apontando — a 2ª via de um boleto antigo ' +
      'precisa do convênio que o registrou. Requer contas-bancarias.excluir.',
  })
  @RequirePermission('contas-bancarias', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
