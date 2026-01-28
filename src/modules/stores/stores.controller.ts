import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

// Buat interface lokal untuk Request yang terautentikasi
interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
@Controller('stores')
@UseGuards(JwtGuard, RolesGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) { }

  @Post()
  @Roles('owner')
  async create(@Body() dto: CreateStoreDto, @Req() req: AuthenticatedRequest) {
    return this.storesService.create(dto, req.user.tenantId);
  }

  @Get()
  @Roles('owner')
  async findAll(
    @Req() req: any,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.storesService.findAll(req.user.tenantId, page, limit);
  }

  @Get('my-access')
  @Roles('owner', 'manager', 'staff') // Bisa diakses keduanya
  async getMyAccess(@Req() req: AuthenticatedRequest) {
    return this.storesService.getMyAccess(req.user);
  }

  @Get(':id')
  @Roles('owner')
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.storesService.findOne(id, req.user.tenantId);
  }

  @Patch(':id')
  @Roles('owner')
  async update(@Param('id') id: string, @Body() dto: UpdateStoreDto, @Req() req: AuthenticatedRequest) {
    return this.storesService.update(id, dto, req.user.tenantId);
  }

  @Delete(':id')
  @Roles('owner')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.storesService.remove(id, req.user.tenantId);
  }

  @Post('shift/open')
  @Roles('owner')
  async openShift(
    @Req() req: AuthenticatedRequest,
    @Body() dto: OpenShiftDto
  ) {
    // userId didapat dari token JWT (req.user.sub atau req.user.id)
    return this.storesService.openShift(req.user.userId, dto);
  }

  @Post('shift/close')
  @UseGuards(JwtGuard)
  async closeShift(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CloseShiftDto
  ) {
    return this.storesService.closeShift(req.user.userId, dto);
  }

  @Post(':id/assign-staff')
  @Roles('owner')
  async assignStaff(@Param('id') id: string, @Body() dto: AssignStaffDto, @Req() req: AuthenticatedRequest) {
    return this.storesService.assignStaff(id, dto.user_id, req.user.tenantId);
  }
}