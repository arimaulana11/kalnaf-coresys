import { Controller, Post, Body, UseGuards, Req, Headers, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from 'src/common/decorators/roles.decorator';
import { VoidTransactionDto } from './dto/void-transaction.dto';

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
}