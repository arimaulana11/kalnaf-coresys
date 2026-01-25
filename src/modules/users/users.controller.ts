import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ChangePasswordDto } from '../user/dto/change-password.dto';
import { AuthUser } from '../auth/interface/auth-user.interface';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Controller('users')
@UseGuards(JwtGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('staff')
  @Roles('owner') // Hanya owner yang bisa tambah staff
  async create(@Body() dto: CreateStaffDto, @Req() req: any) {
    return this.usersService.createStaff(dto, req.user.tenantId);
  }

  @Get('staff')
  @Roles('owner')
  async findAll(@Query('page') page: number, @Req() req: any) {
    return this.usersService.findAllStaff(req.user.tenantId, +page || 1);
  }

  @Patch('staff/:id')
  @Roles('owner')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: any,
  ) {
    return this.usersService.updateStaff(id, dto, req.user.tenantId);
  }

  @Patch('change-password')
  @Roles('owner')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req : AuthenticatedRequest,
  ) {
    // sub adalah standard claim JWT untuk User ID
    const userId = req.user.userId;
    return this.usersService.changePassword(userId, dto);
  }
}