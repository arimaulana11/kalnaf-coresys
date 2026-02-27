import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
// Asumsi Anda punya decorator untuk mengambil User dari Request

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Controller('suppliers')
@UseGuards(JwtGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) { }

  @Post()
  @Roles('owner')
  create(
    @Body() dto: CreateSupplierDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.suppliersService.create(dto, req.user.tenantId);
  }

  @Get()
  @Roles('owner')
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.suppliersService.findAll(req.user.tenantId, +page || 1, +limit || 10);
  }

  @Get('search') // Path: /suppliers/search
  @Roles('owner')
  async search(
    @Query('q') q: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.suppliersService.search(
      q || '',
      req.user.tenantId,
      +page || 1,
      +limit || 10
    );

    return {
      ...result // Ini akan mengirimkan { success, data, meta }
    };
  }

  @Get(':id')
  @Roles('owner')
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.suppliersService.findOne(id, req.user.tenantId);
  }

  @Patch(':id')
  @Roles('owner')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.suppliersService.update(id, dto, req.user.tenantId);
  }

  @Delete(':id')
  @Roles('owner')
  remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    return this.suppliersService.remove(id, req.user.tenantId);
  }
}