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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  PARAMETRO_EMPRESA_CREATE_EXAMPLE,
  PARAMETRO_EMPRESA_EXAMPLE,
} from '@plataforma/contracts';
import { ParametrosService } from './parametros.service';
import {
  ParametroCreateDto,
  ParametroQueryDto,
  ParametroUpdateDto,
} from './dto/parametro.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

// Configuração interna, mantida só pela tela: não há equivalente em
// /integracao de propósito.
@ApiTags('parametros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('parametros')
export class ParametrosController {
  constructor(private readonly service: ParametrosService) {}

  @ApiOperation({
    summary: 'Listar parâmetros da empresa ativa',
    description:
      'Parâmetros do sistema da empresa ativa. Busca por chave ou descrição. ' +
      'Parâmetro de tipo "senha" não devolve o conteúdo, só a marca de preenchido. ' +
      'Requer parametros.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('parametros', 'visualizar')
  @Get()
  findAll(
    @Query() query: ParametroQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar parâmetro',
    description: 'Requer parametros.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: PARAMETRO_EMPRESA_EXAMPLE } })
  @RequirePermission('parametros', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar parâmetro',
    description:
      'A chave é única por empresa. O conteúdo é validado contra o tipo ' +
      '(número, sim/não, data) e o tamanho. Requer parametros.cadastrar.',
  })
  @ApiBodyExample(PARAMETRO_EMPRESA_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: PARAMETRO_EMPRESA_EXAMPLE } })
  @ApiResponse({ status: 409, description: 'Parâmetro já existe na empresa' })
  @RequirePermission('parametros', 'cadastrar')
  @Post()
  create(
    @Body() dto: ParametroCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar parâmetro',
    description:
      'Em parâmetro de tipo "senha", conteúdo vazio mantém a senha atual. ' +
      'Requer parametros.editar.',
  })
  @ApiBodyExample({ conteudo: '45' })
  @RequirePermission('parametros', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ParametroUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir parâmetro (soft delete)',
    description: 'Requer parametros.excluir.',
  })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('parametros', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
