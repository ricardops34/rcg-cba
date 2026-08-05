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
  INTEGRACAO_API_KEY_CREATE_EXAMPLE,
  INTEGRACAO_API_KEY_CRIADA_EXAMPLE,
  INTEGRACAO_API_KEY_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoKeysService } from './integracao-keys.service';
import {
  IntegracaoApiKeyCreateDto,
  IntegracaoApiKeyQueryDto,
  IntegracaoApiKeyUpdateDto,
} from './dto/integracao-api-key.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('integracao-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integracao-keys')
export class IntegracaoKeysController {
  constructor(private readonly service: IntegracaoKeysService) {}

  @ApiOperation({
    summary: 'Listar chaves de API de integração',
    description:
      'Chaves da empresa ativa (nunca expõe a chave em claro, só o prefixo). Requer ' +
      'integracao.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('integracao', 'visualizar')
  @Get()
  findAll(
    @Query() query: IntegracaoApiKeyQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar chave',
    description: 'Requer integracao.visualizar.',
  })
  @RequirePermission('integracao', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Criar chave de API de integração',
    description:
      'A chave em claro (campo "chave") só aparece nesta resposta — não fica recuperável ' +
      'depois. Guarde-a com segurança; se perdida, revogue e crie outra. Requer ' +
      'integracao.cadastrar.',
  })
  @ApiBodyExample(INTEGRACAO_API_KEY_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_API_KEY_CRIADA_EXAMPLE },
  })
  @RequirePermission('integracao', 'cadastrar')
  @Post()
  create(
    @Body() dto: IntegracaoApiKeyCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Editar/revogar chave',
    description:
      'ativo:false revoga a chave imediatamente. Requer integracao.editar.',
  })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_API_KEY_EXAMPLE } })
  @RequirePermission('integracao', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: IntegracaoApiKeyUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user.id, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir chave (soft delete)',
    description: 'Requer integracao.excluir.',
  })
  @RequirePermission('integracao', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user.id, id);
  }
}
