import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query, ParseIntPipe, Req } from '@nestjs/common';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';
import { CustomersService } from './customer.service';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from 'src/common/decorators/roles.decorator';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('customers')
@UseGuards(JwtGuard, RolesGuard)
export class CustomersController {
    constructor(private readonly customersService: CustomersService) { }

    @Post()
    @Roles('owner')
    create(@Body() dto: CreateCustomerDto, @Req() req: AuthenticatedRequest) {
        return this.customersService.create(dto, req.user.tenantId);
    }

    @Get()
    @Roles('owner')
    findAll(@Request() req: AuthenticatedRequest) {
        return this.customersService.findAll(req.user.tenantId);
    }

    @Get('search')
    @Roles('owner')
    async search(
        @Query('q') q: string,
        @Query('page') page: number,
        @Query('limit') limit: number,
        @Request() req,
    ) {
        const tenantId = req.user.tenantId;
        // Jika q kosong, bisa kembalikan array kosong atau panggil findAll
        if (!q) {
            return { data: [], meta: { total: 0, lastPage: 0, currentPage: Number(page) } };
        }

        return this.customersService.search(q, tenantId, page, limit);
    }

    @Get(':id')
    @Roles('owner')
    findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.customersService.findOne(id, req.user.tenantId);
    }

    @Patch(':id')
    @Roles('owner')
    update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: AuthenticatedRequest) {
        return this.customersService.update(id, dto, req.user.tenantId);
    }

    @Delete(':id')
    @Roles('owner')
    remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.customersService.remove(id, req.user.tenantId);
    }
}