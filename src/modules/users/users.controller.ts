import { Controller, Post, Body, Request, UseGuards, Get, Query, Patch, Param } from '@nestjs/common'
import { UsersService } from './users.service'
import { UserPayload } from '../auth/interfaces/jwt-payload.interface'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { Roles } from '@/common/decorators/roles.decorator'
import { CreateStaffDto } from './dto/create-staff.dto'
import { UpdateStaffDto } from './dto/update-staff.dto'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('staff')
  @Roles('owner') // Guard khusus owner
  async create(
    @Body() dto: CreateStaffDto,
    @Request() req: { user: UserPayload },
  ) {
    // tenantId diambil dari payload JWT yang sudah divalidasi
    const tenantId = req.user.tenantId;
    return this.usersService.createStaff(dto, tenantId);
  }

  @Get('staff')
  @Roles('owner', 'manager')
  async findAll(
    @Request() req: { user: UserPayload },
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const tenantId = req.user.tenantId;

    // Konversi string ke number dengan aman
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    return await this.usersService.findAllStaff(tenantId, pageNum, limitNum);
  }

  @Patch('staff/:id')
  @Roles('owner') // Hanya owner yang boleh mengubah data staff
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateStaffDto,
  ) {
    const ownerTenantId = req.user.tenantId;
    return await this.usersService.updateStaff(id, ownerTenantId, dto);
  }
}
