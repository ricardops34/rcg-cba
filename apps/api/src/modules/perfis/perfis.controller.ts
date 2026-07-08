import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PerfisService } from './perfis.service';
import {
  PerfilCreateDto,
  PerfilPermissoesUpdateDto,
  PerfilUpdateDto,
} from './dto/perfil.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('perfis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('perfis')
export class PerfisController {
  constructor(private readonly service: PerfisService) {}

  @RequirePermission('perfis', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @RequirePermission('perfis', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @RequirePermission('perfis', 'cadastrar')
  @Post()
  create(@Body() dto: PerfilCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, dto, user.id);
  }

  @RequirePermission('perfis', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PerfilUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, id, dto, user.id);
  }

  @RequirePermission('perfis', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, id, user.id);
  }

  @RequirePermission('perfis', 'editar')
  @Put(':id/permissoes')
  updatePermissoes(
    @Param('id') id: string,
    @Body() dto: PerfilPermissoesUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePermissoes(user.empresaAtivaId, id, dto, user.id);
  }
}
