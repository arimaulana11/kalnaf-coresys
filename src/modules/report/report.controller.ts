import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { QueryReportDto } from './dto/query-report.dto';
import { ReportsService } from './report.service';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Controller('reports')
@UseGuards(JwtGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Get('sales-summary')
  @Roles('owner', 'manager')
  async getSalesSummary(@Query() query: QueryReportDto, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getSalesSummary(query, req.user.tenantId);
  }

  @Get('daily-summary')
  @Roles('owner', 'manager')
  async getDailySummary(@Query('storeId') storeId: string, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getDailySummary(storeId, req.user.tenantId);
  }

  @Get('payment-methods')
  @Roles('owner', 'manager')
  async getPaymentMethodSummary(@Query('storeId') storeId: string, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getPaymentMethodSummary(storeId, req.user.tenantId);
  }

  @Get('debt-summary')
  @Roles('owner', 'manager')
  async getDebtSummary(@Query('storeId') storeId: string, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getDebtSummary(storeId, req.user.tenantId);
  }

  @Get('sales-stats')
  @Roles('owner', 'manager')
  async getSalesStats(@Query('storeId') storeId: string, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getSalesStats(storeId, req.user.tenantId);
  }

  // ENDPOINT KE-6: Performa Staff/Kasir
  @Get('top-products')
  @Roles('owner', 'manager')
  async getTopProducts(@Query() query: QueryReportDto, @Req() req: AuthenticatedRequest) {
    return this.reportsService.getTopProducts(query, req.user.tenantId);
  }

  // Menggunakan QueryReportDto untuk mendukung pagination performa staff
  @Get('staff-performance')
  @Roles('owner', 'manager')
  async getStaffPerformance(
    @Query() query: QueryReportDto, // <-- Pastikan ini menangkap seluruh objek
    @Req() req: AuthenticatedRequest,
  ) {
    // Sekarang ini sudah valid karena Service mengharapkan QueryReportDto
    return this.reportsService.getStaffPerformance(query, req.user.tenantId);
  }
}