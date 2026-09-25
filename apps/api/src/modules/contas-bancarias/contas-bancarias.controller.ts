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
import { bancoLogoUploadOptions } from '../../common/uploads/uploads.config';

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
    summary: 'Enviar logo do banco',
    description:
      'Faz upload da imagem do logo do banco (PNG, JPEG, WEBP ou SVG, até 2 MB) e grava o caminho em logoUrl. ' +
      'Requer contas-bancarias.editar.',
  })
  @RequirePermission('contas-bancarias', 'editar')
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', bancoLogoUploadOptions))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.setLogo(user.empresaAtivaId, user, id, file.filename);
  }

  @ApiOperation({
    summary: 'Remover logo do banco',
    description: 'Remove o logo cadastrado da conta bancária. Requer contas-bancarias.editar.',
  })
  @RequirePermission('contas-bancarias', 'editar')
  @Delete(':id/logo')
  removeLogo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeLogo(user.empresaAtivaId, user, id);
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
