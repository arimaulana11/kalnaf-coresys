import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryReportDto } from './dto/query-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) { }

  /**
   * Helper: Pagination Logic
   */
  private getPagination(query: QueryReportDto) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    const skip = (page - 1) * limit;
    return { skip, take: limit, page };
  }

  /**
   * 1. Sales Summary (By Date Range)
   * URL: /api/reports/sales-summary
   */
  async getSalesSummary(query: QueryReportDto, tenantId: string) {
    const { storeId, startDate, endDate } = query;

    const summary = await this.prisma.transactions.aggregate({
      where: {
        store_id: storeId,
        tenant_id: tenantId,
        transaction_date: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
        payment_status: { not: 'VOID' as any },
      },
      _sum: {
        total_amount: true,
        paid_amount: true,
        balance_due: true,
      },
      _count: { id: true },
    });

    return {
      total_transactions: summary._count.id || 0,
      gross_sales: summary._sum.total_amount || 0,
      total_collected: summary._sum.paid_amount || 0,
      total_unpaid: summary._sum.balance_due || 0,
    };
  }

  /**
   * 2. Daily Summary (Today)
   * URL: /api/reports/daily-summary
   */
  async getDailySummary(storeId: string, tenantId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const summary = await this.prisma.transactions.aggregate({
      where: {
        store_id: storeId,
        tenant_id: tenantId,
        transaction_date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        payment_status: { not: 'VOID' as any },
      },
      _sum: {
        total_amount: true,
        paid_amount: true,
        balance_due: true,
      },
      _count: { id: true },
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      total_transactions: summary._count.id || 0,
      gross_sales: summary._sum.total_amount || 0,
      total_collected: summary._sum.paid_amount || 0,
      total_unpaid: summary._sum.balance_due || 0,
    };
  }

  /**
   * 3. Top Products (Paginated)
   * URL: /api/reports/top-products
   */
  async getTopProducts(query: QueryReportDto, tenantId: string) {
    const { skip, take, page } = this.getPagination(query);

    const result = await this.prisma.transaction_items.groupBy({
      by: ['product_variant_id'],
      where: {
        transactions: {
          store_id: query.storeId,
          tenant_id: tenantId,
          payment_status: { not: 'VOID' as any },
        },
      },
      _sum: { qty: true, subtotal: true },
      orderBy: { _sum: { qty: 'desc' } },
      skip,
      take,
    });

    const data = await Promise.all(
      result.map(async (item) => {
        const variant = await this.prisma.product_variants.findUnique({
          where: { id: item.product_variant_id },
          select: { name: true },
        });
        return {
          product_name: variant?.name || 'Unknown',
          total_qty: item._sum.qty || 0,
          total_sales: item._sum.subtotal || 0,
        };
      }),
    );

    return {
      data,
      meta: { page, limit: take },
    };
  }

  /**
   * 4. Payment Methods Summary
   * URL: /api/reports/payment-methods
   */
  async getPaymentMethodSummary(storeId: string, tenantId: string) {
    const summary = await this.prisma.transactions.groupBy({
      by: ['payment_method' as any],
      where: {
        store_id: storeId,
        tenant_id: tenantId,
        payment_status: { not: 'VOID' as any },
      },
      _sum: { total_amount: true },
      _count: { id: true },
    });

    return summary.map((item) => ({
      method: item['payment_method' as any],
      count: item._count.id,
      total_amount: item._sum.total_amount || 0,
    }));
  }

  /**
   * 5. Debt Summary
   * URL: /api/reports/debt-summary
   */
  async getDebtSummary(storeId: string, tenantId: string) {
    const debt = await this.prisma.transactions.aggregate({
      where: {
        store_id: storeId,
        tenant_id: tenantId,
        balance_due: { gt: 0 },
        payment_status: { not: 'VOID' as any },
      },
      _sum: { balance_due: true },
      _count: { id: true },
    });

    return {
      unpaid_transaction_count: debt._count.id || 0,
      total_outstanding_debt: debt._sum.balance_due || 0,
    };
  }

  /**
   * 6. Sales Statistics (Monthly Trend)
   * URL: /api/reports/sales-stats
   */
  async getSalesStats(storeId: string, tenantId: string) {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);

    const transactions = await this.prisma.transactions.findMany({
      where: {
        store_id: storeId,
        tenant_id: tenantId,
        transaction_date: { gte: startDate },
        payment_status: { not: 'VOID' as any },
      },
      select: { total_amount: true, transaction_date: true },
    });

    const monthlyStats = Array(12).fill(0).map((_, i) => ({
      month: new Date(currentYear, i).toLocaleString('id-ID', { month: 'long' }),
      total_sales: 0,
    }));

    transactions.forEach((tx) => {
      const monthIndex = new Date(tx.transaction_date).getMonth();
      monthlyStats[monthIndex].total_sales += tx.total_amount;
    });

    return monthlyStats;
  }

  /**
     * 7. Performa Staff (Staff Performance)
     * Menampilkan total penjualan dan nama lengkap dari masing-masing kasir/staff.
     */
  async getStaffPerformance(query: QueryReportDto, tenantId: string) {
    const { skip, take, page } = this.getPagination(query);

    // 1. Grouping transaksi berdasarkan ID user (created_by)
    const performance = await this.prisma.transactions.groupBy({
      by: ['created_by' as any],
      where: {
        store_id: query.storeId,
        tenant_id: tenantId,
        payment_status: { not: 'VOID' as any },
      },
      _sum: {
        total_amount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          total_amount: 'desc',
        },
      },
      skip,
      take,
    });

    // 2. Ambil detail nama staff berdasarkan ID yang didapat dari grouping
    const data = await Promise.all(
      performance.map(async (item) => {
        const staffId = item['created_by' as any];

        const user = await this.prisma.users.findUnique({
          where: { id: staffId },
          select: { name: true },
        });

        return {
          staff_id: staffId,
          staff_name: user?.name || 'Staff Tidak Dikenal',
          transaction_count: item._count.id,
          total_sales: item._sum.total_amount || 0,
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit: take,
      },
    };
  }
}