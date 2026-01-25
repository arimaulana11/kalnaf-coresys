import {
    Controller,
    Post,
    Get,
    Body,
    UseGuards,
    Req,
    Query,
    Headers as NestHeaders,
    Param,
    ParseIntPipe
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { StockOpnameDto, StockTransferDto } from './dto/stock-movement.dto';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('inventory')
@UseGuards(JwtGuard, RolesGuard)
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) { }

    @Get()
    @Roles('owner')
    async getStockList(
        @Req() req: AuthenticatedRequest,
        @NestHeaders('store-id') storeId: string,
    ) {
        // tenantId otomatis didapat dari req.user.tenantId (JWT Payload)
        return this.inventoryService.findAllStock(req.user.tenantId, storeId);
    }

    @Post('stock-in')
    @Roles('owner')
    async stockIn(
        @Req() req: AuthenticatedRequest,
        @NestHeaders('store-id') storeId: string,
        @Body() dto: StockInDto,
    ) {
        return this.inventoryService.processStockIn(req.user.tenantId, storeId, dto);
    }

    @Post('adjustment')
    @Roles('owner')
    async adjustStock(
        @Req() req: AuthenticatedRequest,
        @NestHeaders('store-id') storeId: string,
        @Body() dto: StockAdjustmentDto,
    ) {
        return this.inventoryService.processAdjustment(req.user.tenantId, storeId, dto);
    }

    @Get('logs')
    @Roles('owner')
    async getInventoryLogs(
        @Req() req: AuthenticatedRequest,
        @Query('variantId') variantId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.inventoryService.getLogs(
            req.user.tenantId,
            variantId ? Number(variantId) : undefined,
            page ? Number(page) : 1,
            limit ? Number(limit) : 10
        );
    }

    @Post('transfer')
    @Roles('owner')
    async transferStock(
        @Req() req: AuthenticatedRequest,
        @Body() dto: StockTransferDto,
    ) {
        return this.inventoryService.processTransfer(req.user.tenantId, dto);
    }

    @Post('opname')
    @Roles('owner')
    async stockOpname(
        @Req() req: AuthenticatedRequest,
        @NestHeaders('store-id') storeId: string,
        @Body() dto: StockOpnameDto,
    ) {
        return this.inventoryService.processOpname(req.user.tenantId, storeId, dto);
    }

    @Get('history/:variantId')
    @Roles('owner')
    async getVariantHistory(
        @Req() req: AuthenticatedRequest,
        @Param('variantId', ParseIntPipe) variantId: number,
        @Query('storeId') storeId: string,
        @Query('page') page?: any, // Gunakan any sementara atau string
        @Query('limit') limit?: any,
    ) {
        return this.inventoryService.getVariantHistory(req.user.tenantId, variantId, {
            storeId,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
        });
    }

    @Get('low-stock')
    @Roles('owner')
    async getLowStock(
        @Req() req: AuthenticatedRequest,
        @Query('storeId') storeId: string,
        @Query('threshold') threshold?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.inventoryService.findLowStock(req.user.tenantId, {
            storeId,
            threshold: threshold ? Number(threshold) : 10,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
        });
    }
}