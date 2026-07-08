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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { COLABORADOR_CREATE_EXAMPLE, COLABORADOR_EXAMPLE } from '@plataforma/contracts';
import { ColaboradoresService } from './colaboradores.service';
import { ColaboradorCreateDto, ColaboradorUpdateDto } from './dto/colaborador.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';

const COLABORADOR_ID_EXAMPLE = COLABORADOR_EXAMPLE.id;

@ApiTags('colaboradores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('colaboradores')
export class ColaboradoresController {
  constructor(private readonly service: ColaboradoresService) {}

  @ApiOperation({
    summary: 'Listar colaboradores (vendedores/gestores) da empresa ativa',
    description:
      'A busca (search) filtra pelo nome do usuário vinculado. Isolado por Row-Level Security. Requer colaboradores.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { data: [COLABORADOR_EXAMPLE], total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
  })
  @ApiPaginationQuery()
  @RequirePermission('colaboradores', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar colaborador, incluindo superior e liderados diretos' })
  @ApiParam({ name: 'id', example: COLABORADOR_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: COLABORADOR_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Colaborador não encontrado' })
  @RequirePermission('colaboradores', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar colaborador (vendedor/gestor)',
    description:
      'Associa um usuário já existente a um cargo na hierarquia comercial da empresa ativa ' +
      '(diretor, gerente, supervisor ou vendedor), opcionalmente informando o superior direto. ' +
      'Requer colaboradores.cadastrar.',
  })
  @ApiBodyExample(COLABORADOR_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: COLABORADOR_EXAMPLE } })
  @RequirePermission('colaboradores', 'cadastrar')
  @Post()
  create(@Body() dto: ColaboradorCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, dto, user.id);
  }

  @ApiOperation({
    summary: 'Editar colaborador',
    description: 'Permite trocar cargo, superior, matrícula ou status. Requer colaboradores.editar.',
  })
  @ApiParam({ name: 'id', example: COLABORADOR_ID_EXAMPLE })
  @ApiBodyExample({ cargo: 'supervisor', superiorId: null })
  @RequirePermission('colaboradores', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ColaboradorUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Excluir colaborador (soft delete)',
    description: 'Requer colaboradores.excluir.',
  })
  @ApiParam({ name: 'id', example: COLABORADOR_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('colaboradores', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, id, user.id);
  }
}
