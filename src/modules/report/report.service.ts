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
        storeId: storeId,
        tenantId: tenantId,
        transactionDate: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
        paymentStatus: { not: 'VOID' as any },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
        balanceDue: true,
      },
      _count: { id: true },
    });

    return {
      total_transactions: summary._count.id || 0,
      gross_sales: summary._sum.totalAmount || 0,
      total_collected: summary._sum.paidAmount || 0,
      total_unpaid: summary._sum.balanceDue || 0,
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
        storeId: storeId,
        tenantId: tenantId,
        transactionDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        paymentStatus: { not: 'VOID' as any },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
        balanceDue: true,
      },
      _count: { id: true },
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      total_transactions: summary._count.id || 0,
      gross_sales: summary._sum.totalAmount || 0,
      total_collected: summary._sum.paidAmount || 0,
      total_unpaid: summary._sum.balanceDue || 0,
    };
  }

  /**
   * 3. Top Products (Paginated)
   * URL: /api/reports/top-products
   */
  async getTopProducts(query: QueryReportDto, tenantId: string) {
    const { skip, take, page } = this.getPagination(query);

    const result = await this.prisma.transaction_items.groupBy({
      by: ['variantId'],
      where: {
        transaction: {
          storeId: query.storeId,
          tenantId: tenantId,
          paymentStatus: { not: 'VOID' as any },
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
          where: { id: item.variantId },
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
        storeId: storeId,
        tenantId: tenantId,
        paymentStatus: { not: 'VOID' as any },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    return summary.map((item) => ({
      method: item['payment_method' as any],
      count: item._count.id,
      totalAmount: item._sum.totalAmount || 0,
    }));
  }

  /**
   * 5. Debt Summary
   * URL: /api/reports/debt-summary
   */
  async getDebtSummary(storeId: string, tenantId: string) {
    const debt = await this.prisma.transactions.aggregate({
      where: {
        storeId: storeId,
        tenantId: tenantId,
        balanceDue: { gt: 0 },
        paymentStatus: { not: 'VOID' as any },
      },
      _sum: { balanceDue: true },
      _count: { id: true },
    });

    return {
      unpaid_transaction_count: debt._count.id || 0,
      total_outstanding_debt: debt._sum.balanceDue || 0,
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
        storeId: storeId,
        tenantId: tenantId,
        transactionDate: { gte: startDate },
        paymentStatus: { not: 'VOID' as any },
      },
      select: { totalAmount: true, transactionDate: true },
    });

    const monthlyStats = Array(12).fill(0).map((_, i) => ({
      month: new Date(currentYear, i).toLocaleString('id-ID', { month: 'long' }),
      total_sales: 0,
    }));

    transactions.forEach((tx) => {
      const monthIndex = new Date(tx.transactionDate).getMonth();
      monthlyStats[monthIndex].total_sales += tx.totalAmount;
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
        storeId: query.storeId,
        tenantId: tenantId,
        paymentStatus: { not: 'VOID' as any },
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc',
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
          total_sales: item._sum.totalAmount || 0,
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

    // Filter berdasarkan field 'transactionDate' sesuai schema
    const dateFilter = {
      transactionDate: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    };

    // Eksekusi paralel untuk performa maksimal
    const [summaryData, voidData, paymentMethods, topProducts, records, totalRecords] = await Promise.all([

      // 1. Summary Agregat untuk status PAID
      this.prisma.transactions.aggregate({
        where: { ...dateFilter, paymentStatus: 'PAID' },
        _sum: { totalAmount: true },
        _count: { id: true },
        _avg: { totalAmount: true },
      }),

      // 2. Summary Agregat untuk status VOID
      this.prisma.transactions.aggregate({
        where: { ...dateFilter, paymentStatus: 'VOID' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),

      // 3. Breakdown per Metode Pembayaran
      this.prisma.transactions.groupBy({
        by: ['paymentMethod'],
        where: { ...dateFilter, paymentStatus: 'PAID' },
        _sum: { totalAmount: true },
      }),

      // 4. Produk Terlaris (Top 5)
      // Relasi di schema: transaction_items -> transactions
      this.prisma.transaction_items.groupBy({
        by: ['variantId'], // Kita group by ID dulu
        where: {
          transaction: {
            ...dateFilter,
            paymentStatus: 'PAID',
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
        orderBy: { transactionDate: 'desc' },
        include: {
          // Opsional: Jika ingin nama user/kasir muncul
          creator: { select: { name: true } }
        }
      }),

      // 6. Total data untuk meta
      this.prisma.transactions.count({ where: dateFilter }),
    ]);

    // Tambahan: Ambil nama produk untuk top_products karena groupBy tidak bisa include
    const topProductsWithNames = await Promise.all(
      topProducts.map(async (item) => {
        const variant = await this.prisma.product_variants.findUnique({
          where: { id: item.variantId },
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
        revenue: summaryData._sum.totalAmount || 0,
        transactions_count: summaryData._count.id || 0,
        average_per_order: Math.round(summaryData._avg.totalAmount || 0),
        total_void_amount: voidData._sum.totalAmount || 0,
        total_void_count: voidData._count.id || 0,
      },
      payment_methods: paymentMethods.map(p => ({
        method: p.paymentMethod,
        total: p._sum.totalAmount || 0
      })),
      top_products: topProductsWithNames,
      records: records.map(r => ({
        id: r.id,
        customer_name: r.customerName || 'Umum',
        totalAmount: r.totalAmount,
        paymentStatus: r.paymentStatus,
        payment_method: r.paymentMethod,
        cashier: r.creator?.name,
        date: r.transactionDate,
        time: r.transactionDate.toLocaleTimeString('id-ID', {
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