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
  REGRA_DESCONTO_CREATE_EXAMPLE,
  REGRA_DESCONTO_EXAMPLE,
} from '@plataforma/contracts';
import { RegrasDescontoService } from './regras-desconto.service';
import {
  RegraDescontoCreateDto,
  RegraDescontoQueryDto,
  RegraDescontoUpdateDto,
} from './dto/regra-desconto.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('regras-desconto')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('regras-desconto')
export class RegrasDescontoController {
  constructor(private readonly service: RegrasDescontoService) {}

  @ApiOperation({
    summary: 'Listar regras de desconto',
    description:
      'Regras da empresa ativa, com as faixas embutidas. Busca por descrição ou código ERP. ' +
      'Requer regras-desconto.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('regras-desconto', 'visualizar')
  @Get()
  findAll(
    @Query() query: RegraDescontoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar regra de desconto',
    description: 'Requer regras-desconto.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: REGRA_DESCONTO_EXAMPLE } })
  @RequirePermission('regras-desconto', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar regra de desconto',
    description:
      'As faixas vêm no mesmo corpo. Requer regras-desconto.cadastrar.',
  })
  @ApiBodyExample(REGRA_DESCONTO_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: REGRA_DESCONTO_EXAMPLE } })
  @RequirePermission('regras-desconto', 'cadastrar')
  @Post()
  create(
    @Body() dto: RegraDescontoCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar regra de desconto',
    description:
      'Enviar "faixas" substitui o conjunto inteiro; omitir mantém as atuais. ' +
      'Requer regras-desconto.editar.',
  })
  @ApiBodyExample({ descricao: 'REGRA GERAL', percComissao: 10 })
  @RequirePermission('regras-desconto', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: RegraDescontoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir regra de desconto (soft delete)',
    description: 'Requer regras-desconto.excluir.',
  })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('regras-desconto', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
