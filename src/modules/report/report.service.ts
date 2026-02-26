import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryReportDto } from './dto/query-report.dto';
import { Repository } from 'typeorm';
import { ShiftReportQueryDto } from './dto/shift-report-query.dto';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService
  ) { }

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

  async getSalesReport(query: SalesReportQueryDto) {
    const { startDate, endDate, page, limit } = query;
    const skip = (page - 1) * limit;

    // Filter berdasarkan field 'transaction_date' sesuai schema
    const dateFilter = {
      transaction_date: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    };

    // Eksekusi paralel untuk performa maksimal
    const [summaryData, voidData, paymentMethods, topProducts, records, totalRecords] = await Promise.all([

      // 1. Summary Agregat untuk status PAID
      this.prisma.transactions.aggregate({
        where: { ...dateFilter, payment_status: 'PAID' },
        _sum: { total_amount: true },
        _count: { id: true },
        _avg: { total_amount: true },
      }),

      // 2. Summary Agregat untuk status VOID
      this.prisma.transactions.aggregate({
        where: { ...dateFilter, payment_status: 'VOID' },
        _sum: { total_amount: true },
        _count: { id: true },
      }),

      // 3. Breakdown per Metode Pembayaran
      this.prisma.transactions.groupBy({
        by: ['payment_method'],
        where: { ...dateFilter, payment_status: 'PAID' },
        _sum: { total_amount: true },
      }),

      // 4. Produk Terlaris (Top 5)
      // Relasi di schema: transaction_items -> transactions
      this.prisma.transaction_items.groupBy({
        by: ['product_variant_id'], // Kita group by ID dulu
        where: {
          transactions: {
            ...dateFilter,
            payment_status: 'PAID',
          },
        },
        _sum: { qty: true, subtotal: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 5,
      }),

      // 5. Records List dengan Paginasi
      this.prisma.transactions.findMany({
        where: dateFilter,
        skip,
        take: limit,
        orderBy: { transaction_date: 'desc' },
        include: {
          // Opsional: Jika ingin nama user/kasir muncul
          users: { select: { name: true } }
        }
      }),

      // 6. Total data untuk meta
      this.prisma.transactions.count({ where: dateFilter }),
    ]);

    // Tambahan: Ambil nama produk untuk top_products karena groupBy tidak bisa include
    const topProductsWithNames = await Promise.all(
      topProducts.map(async (item) => {
        const variant = await this.prisma.product_variants.findUnique({
          where: { id: item.product_variant_id },
          select: { name: true }
        });
        return {
          name: variant?.name || 'Unknown',
          sold: item._sum.qty || 0,
          revenue: item._sum.subtotal || 0
        };
      })
    );

    return {
      summary: {
        revenue: summaryData._sum.total_amount || 0,
        transactions_count: summaryData._count.id || 0,
        average_per_order: Math.round(summaryData._avg.total_amount || 0),
        total_void_amount: voidData._sum.total_amount || 0,
        total_void_count: voidData._count.id || 0,
      },
      payment_methods: paymentMethods.map(p => ({
        method: p.payment_method,
        total: p._sum.total_amount || 0
      })),
      top_products: topProductsWithNames,
      records: records.map(r => ({
        id: r.id,
        customer_name: r.customer_name || 'Umum',
        total_amount: r.total_amount,
        payment_status: r.payment_status,
        payment_method: r.payment_method,
        cashier: r.users?.name,
        date: r.transaction_date,
        time: r.transaction_date.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        })
      })),
      meta: {
        total: totalRecords,
        page,
        lastPage: Math.ceil(totalRecords / limit),
        limit
      }
    };
  }

  async getShiftReports(query: ShiftReportQueryDto) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.startDate && query.endDate) {
      where.startTime = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [shifts, total] = await Promise.all([
      this.prisma.store_shifts.findMany({
        where,
        include: {
          user: { select: { name: true } },
          store: { select: { name: true } },
        },
        orderBy: { startTime: 'desc' },
        take: limit,
        skip: skip,
      }),
      this.prisma.store_shifts.count({ where }),
    ]);

    const records = shifts.map((shift) => {
      // Di sini nanti kamu bisa tambah logic sum dari table transactions
      // yang method-nya CASH dan shift_id nya sama.
      const expectedCash = shift.startingCash + 0;
      const actualCash = shift.closingCash || 0;
      const difference = shift.status === 'CLOSED' ? (actualCash - expectedCash) : 0;

      return {
        id: shift.id,
        cashier_name: shift.user?.name || 'Unknown',
        start_time: shift.startTime,
        end_time: shift.endTime,
        status: shift.status,
        starting_cash: shift.startingCash,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference: difference,
      };
    });

    // --- KALKULASI SUMMARY ---
    const summary = {
      total_shifts: total,
      total_expected_cash: records.reduce((sum, item) => sum + item.expected_cash, 0),
      total_actual_cash: records.reduce((sum, item) => sum + item.actual_cash, 0),
      total_difference: records.reduce((sum, item) => sum + item.difference, 0),
    };

    return {
      summary,
      records,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

}