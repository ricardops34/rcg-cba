import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { EMPRESA_CREATE_EXAMPLE, EMPRESA_EXAMPLE } from '@plataforma/contracts';
import { EmpresasService } from './empresas.service';
import { EmpresaCreateDto, EmpresaUpdateDto } from './dto/empresa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import { logoUploadOptions } from '../../common/uploads/uploads.config';

const EMPRESA_ID_EXAMPLE = EMPRESA_EXAMPLE.id;

@ApiTags('empresas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly service: EmpresasService) {}

  @ApiOperation({
    summary: 'Listar empresas',
    description:
      'Lista empresas cadastradas no sistema, com paginação, busca e ordenação. ' +
      'Requer a permissão empresas.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { data: [EMPRESA_EXAMPLE], total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  })
  @ApiPaginationQuery()
  @RequirePermission('empresas', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Detalhar empresa' })
  @ApiParam({ name: 'id', example: EMPRESA_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: EMPRESA_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada' })
  @RequirePermission('empresas', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({
    summary: 'Cadastrar empresa',
    description: 'Requer a permissão empresas.cadastrar. O CNPJ deve ser único no sistema.',
  })
  @ApiBodyExample(EMPRESA_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: EMPRESA_EXAMPLE } })
  @ApiResponse({ status: 409, description: 'CNPJ já cadastrado' })
  @RequirePermission('empresas', 'cadastrar')
  @Post()
  create(@Body() dto: EmpresaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Editar empresa', description: 'Requer a permissão empresas.editar.' })
  @ApiParam({ name: 'id', example: EMPRESA_ID_EXAMPLE })
  @ApiBodyExample({ nomeFantasia: 'Andrade Distribuidora Ltda' })
  @ApiResponse({ status: 200, schema: { example: EMPRESA_EXAMPLE } })
  @RequirePermission('empresas', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: EmpresaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Enviar logo da empresa',
    description:
      'Faz upload do logo (PNG, JPEG, WEBP ou SVG, até 2 MB) e grava o caminho em logoUrl. ' +
      'Requer a permissão empresas.editar.',
  })
  @ApiParam({ name: 'id', example: EMPRESA_ID_EXAMPLE })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, schema: { example: EMPRESA_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Arquivo ausente ou formato inválido' })
  @RequirePermission('empresas', 'editar')
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', logoUploadOptions))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.setLogo(id, file.filename, user.id);
  }

  @ApiOperation({
    summary: 'Excluir empresa (soft delete)',
    description:
      'Marca a empresa como excluída (deletedAt) e inativa (ativo=false) sem remover o registro fisicamente. Requer a permissão empresas.excluir.',
  })
  @ApiParam({ name: 'id', example: EMPRESA_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('empresas', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }
}
