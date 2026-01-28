import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateCustomerDto, tenantId: string) {
        return this.prisma.customers.create({
            data: {
                ...dto,
                tenantId: tenantId,
            },
        });
    }

    async findAll(tenantId: string, page: number = 1, limit: number = 10) {
        // Pastikan page dan limit minimal bernilai 1
        const take = Number(limit) || 10;
        const skip = (Number(page) - 1) * take;

        // Jalankan count dan findMany secara paralel untuk performa lebih baik
        const [data, total] = await Promise.all([
            this.prisma.customers.findMany({
                where: { tenantId: tenantId },
                take: take,
                skip: skip,
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.customers.count({
                where: { tenantId: tenantId },
            }),
        ]);

        const lastPage = Math.ceil(total / take);

        return {
            data,
            meta: {
                total,
                lastPage,
                currentPage: Number(page),
                perPage: take,
                prev: page > 1 ? page - 1 : null,
                next: page < lastPage ? Number(page) + 1 : null,
            },
        };
    }

    async findOne(id: string, tenantId: string) { // Ubah tipe id ke string
        const customer = await this.prisma.customers.findFirst({
            where: {
                id: id,
                tenantId: tenantId // Pastikan penulisan sesuai skema (tenantId atau tenant_id)
            },
        });
        if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
        return customer;
    }

    async update(id: string, dto: UpdateCustomerDto, tenantId: string) {
        await this.findOne(id, tenantId);
        return this.prisma.customers.update({
            where: { id }, // Sekarang id sudah string, Prisma tidak akan error
            data: dto,
        });
    }

    async remove(id: string, tenantId: string) {
        await this.findOne(id, tenantId);
        return this.prisma.customers.delete({
            where: { id },
        });
    }

    async search(query: string, tenantId: string, page: number = 1, limit: number = 10) {
        const take = Number(limit) || 10;
        const skip = (Number(page) - 1) * take;

        // Definisi filter pencarian agar bisa dipakai ulang di findMany dan count
        const whereCondition = {
            tenantId: tenantId,
            OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                { phone: { contains: query } },
                { email: { contains: query, mode: 'insensitive' as const } },
            ],
        };

        const [data, total] = await Promise.all([
            this.prisma.customers.findMany({
                where: whereCondition,
                take: take,
                skip: skip,
                orderBy: { name: 'asc' }, // Biasanya pencarian diurutkan berdasarkan nama
            }),
            this.prisma.customers.count({
                where: whereCondition,
            }),
        ]);

        const lastPage = Math.ceil(total / take);

        return {
            data,
            meta: {
                total,
                lastPage,
                currentPage: Number(page),
                perPage: take,
                prev: page > 1 ? page - 1 : null,
                next: page < lastPage ? Number(page) + 1 : null,
            },
        };
    }
}