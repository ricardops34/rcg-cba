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
import { ArmazensService } from './armazens.service';
import { ArmazemCreateDto, ArmazemQueryDto, ArmazemUpdateDto } from './dto/armazem.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

@ApiTags('armazens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('armazens')
export class ArmazensController {
  constructor(private readonly service: ArmazensService) {}

  @ApiOperation({
    summary: 'Listar armazéns',
    description:
      'Armazéns da empresa ativa. Busca por descrição ou código ERP. Requer armazens.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('armazens', 'visualizar')
  @Get()
  findAll(@Query() query: ArmazemQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar armazém', description: 'Requer armazens.visualizar.' })
  @RequirePermission('armazens', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Cadastrar armazém', description: 'Requer armazens.cadastrar.' })
  @RequirePermission('armazens', 'cadastrar')
  @Post()
  create(@Body() dto: ArmazemCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar armazém', description: 'Requer armazens.editar.' })
  @RequirePermission('armazens', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ArmazemUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir armazém (soft delete)', description: 'Requer armazens.excluir.' })
  @RequirePermission('armazens', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
