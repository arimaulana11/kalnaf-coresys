import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Query
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) { }

  @Post()
  @Roles('owner')
  async create(@Request() req: { user: UserPayload }, @Body() createStoreDto: CreateStoreDto) {
    const { tenantId, userId } = req.user;
    return this.storesService.create(tenantId, userId, createStoreDto);
  }

  @Get()
  @Roles('owner', 'manager')
  async findAll(
    @Request() req: { user: UserPayload },
    @Query('page') page: any,  // Gunakan any dulu untuk divalidasi manual
    @Query('limit') limit: any,
  ) {
    const tenantId = req.user.tenantId;

    // Pastikan angka valid, jika tidak gunakan default
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);

    return await this.storesService.findAll(tenantId, pageNum, limitNum);
  }

  @Get('my-access')
  async getMyAccess(@Request() req: { user: UserPayload }) {
    const {userId, role, tenantId} = req.user;

    return await this.storesService.getMyAccess(userId,role, tenantId);
  }

  @Get(':id')
  @Roles('owner', 'manager')
  async detail(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Memastikan owner hanya mengupdate toko milik tenant-nya sendiri
    return this.storesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  async update(
    @Request() req: { user: UserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoreDto: UpdateStoreDto,
  ) {
    // Memastikan owner hanya mengupdate toko milik tenant-nya sendiri
    return this.storesService.update(req.user.tenantId, id, updateStoreDto);
  }

  @Post(':id/assign')
  @Roles('owner')
  async assignStaff(
    @Request() req: { user: UserPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body('user_id', ParseUUIDPipe) staffUserId: string,
  ) {
    // Logic ini krusial untuk menambah Kasir/Manager ke cabang tertentu
    return this.storesService.assignStaff(req.user.tenantId, id, staffUserId);
  }
}