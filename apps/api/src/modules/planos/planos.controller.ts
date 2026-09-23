import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PlanosService } from './planos.service';

@ApiTags('plataforma-planos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma/planos')
export class PlanosController {
  constructor(private readonly service: PlanosService) {}

  @ApiOperation({ summary: 'Listar planos/pacotes SaaS' })
  @Get()
  listPlanos() {
    return this.service.listPlanos();
  }

  @ApiOperation({ summary: 'Obter detalhe de um plano' })
  @ApiParam({ name: 'id' })
  @Get(':id')
  getPlano(@Param('id') id: string) {
    return this.service.getPlano(id);
  }

  @ApiOperation({ summary: 'Criar plano de funcionalidades' })
  @Post()
  createPlano(
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createPlano(dto, user.id);
  }

  @ApiOperation({ summary: 'Editar plano de funcionalidades' })
  @ApiParam({ name: 'id' })
  @Patch(':id')
  updatePlano(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePlano(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Excluir plano (soft delete)' })
  @ApiParam({ name: 'id' })
  @Delete(':id')
  removePlano(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removePlano(id, user.id);
  }
}
