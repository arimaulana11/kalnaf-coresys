import { Controller, Post, Body, UseGuards, Req, Headers, Get, Param, ParseIntPipe, Query, Patch } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';       // Ubah ke relative
import { RolesGuard } from '../../common/guards/roles.guard';   // Ubah ke relative
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { PayDebtDto } from './dto/pay-debt.dto';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('transactions')
@UseGuards(JwtGuard, RolesGuard)
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }

    @Post()
    @Roles('owner')
    async create(
        @Body() createTransactionDto: CreateTransactionDto,
        @Req() req: AuthenticatedRequest,
        @Headers('store-id') storeIdHeader: string,
    ) {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId;

        // Gunakan storeId dari body atau header
        const finalStoreId = createTransactionDto.storeId || storeIdHeader;

        return this.transactionsService.createTransaction(
            tenantId,
            userId,
            { ...createTransactionDto, storeId: finalStoreId }
        );
    }

    @Get('receipt/:id')
    @Roles('owner')
    async getReceipt(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ) {
        const tenantId = req.user.tenantId; // Diambil dari JWT Payload
        return this.transactionsService.getTransactionReceipt(id, tenantId);
    }

    @Post(':id/void')
    @Roles('owner')
    async voidTransaction(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: VoidTransactionDto,
        @Req() req: AuthenticatedRequest,
    ) {
        const tenantId = req.user.tenantId;
        const userId = req.user.userId; // ID user yang melakukan pembatalan
        return this.transactionsService.voidTransaction(id, tenantId, userId, dto.reason);
    }

    @Get('debts')
    @Roles('owner')
    async getDebts(
        @Query('page') page,
        @Query('limit') limit,
        @Query('customerId') customerId: string, // Tambahkan ini
        @Req() req: AuthenticatedRequest
    ) {
        return this.transactionsService.getDebts(req.user.tenantId, page, limit, customerId);
    }

    @Patch(':id/pay-debt')
    @Roles('owner')
    async payDebt(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: PayDebtDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.payDebt(id, dto, req.user.tenantId);
    }

    @Get('history')
    @Roles('owner')
    async getHistory(
        @Req() req: AuthenticatedRequest,
        @Query('storeId') storeId?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
    ) {
        return this.transactionsService.getAllHistory(req.user.tenantId, {
            storeId,
            page,
            limit,
            search,
            status
        });
    }

    @Get(':id')
    @Roles('owner')
    async getTransactionDetail(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest
    ) {
        // Pastikan tenantId diambil dari token user untuk keamanan data
        const tenantId = req.user.tenantId;

        return this.transactionsService.getTransactionDetail(id, tenantId);
    }
}