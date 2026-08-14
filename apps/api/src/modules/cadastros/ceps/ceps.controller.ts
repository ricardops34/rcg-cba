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
import { CONSULTA_CEP_EXAMPLE } from '@plataforma/contracts';
import { CepsService } from './ceps.service';
import { CepCreateDto, CepQueryDto, CepUpdateDto } from './dto/cep.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('ceps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ceps')
export class CepsController {
  constructor(private readonly service: CepsService) {}

  @ApiOperation({
    summary: 'Listar CEPs',
    description:
      'Cache de CEPs consultados (referência global). Filtros por estado/município; busca por CEP, ' +
      'endereço ou bairro. Requer ceps.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('ceps', 'visualizar')
  @Get()
  findAll(@Query() query: CepQueryDto) {
    return this.service.findAll(query);
  }

  // Declarado antes de GET :id, senão o Nest casa "consulta" como :id.
  @ApiOperation({
    summary: 'Resolver endereço por CEP (ViaCEP, cache-first)',
    description:
      'Devolve o endereço do CEP para autopreencher formulário. Busca primeiro no cache local ' +
      '(tabela de CEPs) e só chama o ViaCEP no miss, persistindo o resultado — `origem` diz de ' +
      'onde veio. Estado e município são resolvidos na referência local (município pelo código ' +
      'IBGE). 404 para CEP inexistente, 502 se o ViaCEP estiver fora. Utilitário de formulário: ' +
      'só exige login, sem permissão de módulo.',
  })
  @ApiResponse({ status: 200, schema: { example: CONSULTA_CEP_EXAMPLE } })
  @Get('consulta/:cep')
  consultar(@Param('cep') cep: string) {
    return this.service.consultar(cep);
  }

  @ApiOperation({ summary: 'Detalhar CEP', description: 'Requer ceps.visualizar.' })
  @RequirePermission('ceps', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Cadastrar CEP', description: 'Requer ceps.cadastrar.' })
  @RequirePermission('ceps', 'cadastrar')
  @Post()
  create(@Body() dto: CepCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user, dto);
  }

  @ApiOperation({ summary: 'Editar CEP', description: 'Requer ceps.editar.' })
  @RequirePermission('ceps', 'editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CepUpdateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir CEP (soft delete)', description: 'Requer ceps.excluir.' })
  @RequirePermission('ceps', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user, id);
  }
}
