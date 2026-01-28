import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { v4 as uuidv4 } from 'uuid';
import { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

@Injectable()
export class StoresService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateStoreDto, tenantId: string) {
        return this.prisma.stores.create({
            data: {
                id: uuidv4(),
                ...dto,
                tenant_id: tenantId,
            },
        });
    }

    async findAll(tenantId: string, page: number = 1, limit: number = 10) {
        // Menghitung berapa data yang harus dilewati
        const skip = (page - 1) * limit;

        // Menjalankan query data dan hitung total secara paralel
        const [data, total] = await Promise.all([
            this.prisma.stores.findMany({
                where: { tenant_id: tenantId },
                orderBy: { created_at: 'desc' },
                skip: skip,
                take: limit,
                include: {
                    _count: { select: { user_stores: true } },
                },
            }),
            this.prisma.stores.count({
                where: { tenant_id: tenantId }
            }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: string, tenantId: string) {
        const store = await this.prisma.stores.findFirst({
            where: { id, tenant_id: tenantId },
            include: {
                user_stores: {
                    include: {
                        users: {
                            select: { id: true, name: true, email: true, role: true, is_active: true },
                        },
                    },
                },
            },
        });

        if (!store) throw new NotFoundException('Store not found');
        return store;
    }

    async update(id: string, dto: UpdateStoreDto, tenantId: string) {
        await this.findOne(id, tenantId); // Validasi kepemilikan

        return this.prisma.stores.update({
            where: { id },
            data: dto,
        });
    }

    async remove(id: string, tenantId: string) {
        await this.findOne(id, tenantId); // Validasi kepemilikan

        // Hapus relasi staff terlebih dahulu (Cascade manual jika tidak diatur di DB)
        await this.prisma.user_stores.deleteMany({ where: { store_id: id } });

        return this.prisma.stores.delete({ where: { id } });
    }

    async assignStaff(storeId: string, userId: string, tenantId: string) {
        // 1. Pastikan toko milik tenant
        await this.findOne(storeId, tenantId);

        // 2. Pastikan user (staff) ada di tenant yang sama
        const user = await this.prisma.users.findFirst({
            where: { id: userId, tenant_id: tenantId }
        });
        if (!user) throw new NotFoundException('Staff not found in your tenant');

        // 3. Cek duplikasi
        const exists = await this.prisma.user_stores.findFirst({
            where: { store_id: storeId, user_id: userId }
        });
        if (exists) throw new ConflictException('Staff already assigned to this store');

        return this.prisma.user_stores.create({
            data: {
                store_id: storeId,
                user_id: userId,
            },
        });
    }

    async getMyAccess(user: { userId: string; tenantId: string; role: string }) {
        if (user.role === 'owner') {
            const allStores = await this.prisma.stores.findMany({
                where: { tenant_id: user.tenantId },
                orderBy: { created_at: 'desc' },
            });

            return allStores.map((store) => ({
                id: store.id,
                tenant_id: store.tenant_id,
                name: store.name,
                address: store.address,
                phone: store.phone,
                logo_url: store.logo_url,
                receipt_header: store.receipt_header,
                receipt_footer: store.receipt_footer,
                is_active: true, // Owner selalu dianggap aktif untuk semua tokonya
                createdAt: store.created_at.toISOString(),
                updatedAt: store.updated_at.toISOString(),
            }));
        }

        // 2. Jika Role adalah Staff/Manager, tarik hanya toko yang di-assign
        const access = await this.prisma.user_stores.findMany({
            where: {
                user_id: user.userId,
                status: 'active'
            },
            include: {
                stores: true,
            },
        });

        return access.map((item) => ({
            id: item.stores.id,
            tenant_id: item.stores.tenant_id,
            name: item.stores.name,
            address: item.stores.address,
            phone: item.stores.phone,
            logo_url: item.stores.logo_url,
            receipt_header: item.stores.receipt_header,
            receipt_footer: item.stores.receipt_footer,
            is_active: item.status === 'active',
            createdAt: item.stores.created_at.toISOString(),
            updatedAt: item.stores.updated_at.toISOString(),
        }));
    }

    async openShift(userId: string, dto: OpenShiftDto) {
        const activeShift = await this.prisma.store_shifts.findFirst({
            where: { userId, status: 'OPEN' }
        });

        if (activeShift) {
            throw new BadRequestException('Anda masih memiliki shift yang belum ditutup.');
        }

        const shift = await this.prisma.store_shifts.create({
            data: {
                storeId: dto.storeId,
                userId: userId,
                startingCash: dto.startingCash,
                status: 'OPEN'
            }
        });

        // Mengembalikan data dengan konversi tipe agar response bersih
        return {
            ...shift,
            startingCash: Number(shift.startingCash),
            startTime: shift.startTime.toISOString()
        };
    }

    // TODO : nanti update ketika modul sales selesai karena total transaksi belum dapat dari situ
    async closeShift(userId: string, dto: CloseShiftDto) {
        const shift = await this.prisma.store_shifts.findUnique({
            where: { id: dto.shiftId }
        });

        if (!shift || shift.status === 'CLOSED') {
            throw new BadRequestException('Shift tidak ditemukan atau sudah ditutup.');
        }

        if (shift.userId !== userId) {
            throw new ForbiddenException('Anda tidak berwenang menutup shift ini.');
        }

        // Perhitungan sementara tanpa tabel sales
        const totalCashSalesAmount = 0;
        const expectedCash = Number(shift.startingCash) + totalCashSalesAmount;
        const difference = dto.actualCash - expectedCash;

        const updatedShift = await this.prisma.store_shifts.update({
            where: { id: dto.shiftId },
            data: {
                status: 'CLOSED',
                endTime: new Date(),
                closingCash: dto.actualCash,
            }
        });

        return {
            message: 'Shift berhasil ditutup',
            data: {
                id: updatedShift.id,
                expectedCash,
                actualCash: dto.actualCash,
                difference,
                status: updatedShift.status
            }
        };
    }
}