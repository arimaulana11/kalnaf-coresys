import {
    Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards,
    Put, Query // Tambahkan Query
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('staff')
@UseGuards(JwtGuard, RolesGuard)
export class StaffController {
    constructor(private readonly staffService: StaffService) { }

    @Post()
    @Roles('owner')
    create(@Body() createStaffDto: CreateStaffDto, @Req() req: AuthenticatedRequest) {
        return this.staffService.create(createStaffDto, req.user.tenantId);
    }

    // VERSI PAGINATION
    @Get()
    @Roles('owner', 'manager')
    findAll(
        @Req() req: AuthenticatedRequest,
        @Query('page') page: string = '1',   // Ambil dari query param, default '1'
        @Query('limit') limit: string = '10' // Ambil dari query param, default '10'
    ) {
        // Konversi string ke number sebelum dikirim ke service
        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);
        
        return this.staffService.findAll(req.user.tenantId, pageNumber, limitNumber);
    }

    @Get(':id')
    @Roles('owner', 'manager')
    findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.staffService.findOne(req.user.tenantId, id);
    }

    @Patch(':id')
    @Roles('owner')
    update(
        @Param('id') id: string,
        @Body() updateStaffDto: UpdateStaffDto,
        @Req() req: AuthenticatedRequest
    ) {
        return this.staffService.update(id, updateStaffDto, req.user.tenantId);
    }

    @Delete(':id')
    @Roles('owner')
    remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.staffService.remove(id, req.user.tenantId);
    }

    @Put(':id/status') // Sebaiknya spesifik path agar tidak bentrok dengan patch
    @Roles('owner')
    inactive(
      @Param('id') id: string, 
      @Body('is_active') isActive: boolean,
      @Req() req: AuthenticatedRequest
    ) {
        return this.staffService.updateStatus(id, req.user.tenantId, isActive);
    }
}