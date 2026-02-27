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
                name: dto.name,
                address: dto.address,
                phone: dto.phone,
                receiptHeader: dto.receipt_header,
                receiptFooter: dto.receipt_footer,
                logoUrl: dto.logo_url,
                tenantId: tenantId,
            },
        });
    }

    async findAll(tenantId: string, page: number = 1, limit: number = 10) {
        // Menghitung berapa data yang harus dilewati
        const skip = (page - 1) * limit;

        // Menjalankan query data dan hitung total secara paralel
        const [data, total] = await Promise.all([
            this.prisma.stores.findMany({
                where: { tenantId: tenantId },
                orderBy: { createdAt: 'desc' },
                skip: skip,
                take: limit,
                include: {
                    _count: { select: { userStores: true } },
                },
            }),
            this.prisma.stores.count({
                where: { tenantId: tenantId }
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
            where: { id, tenantId: tenantId },
            include: {
                userStores: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, role: true, isActive: true },
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
        await this.prisma.user_stores.deleteMany({ where: { storeId: id } });

        return this.prisma.stores.delete({ where: { id } });
    }

    async assignStaff(storeId: string, userId: string, tenantId: string) {
        // 1. Pastikan toko milik tenant
        await this.findOne(storeId, tenantId);

        // 2. Pastikan user (staff) ada di tenant yang sama
        const user = await this.prisma.users.findFirst({
            where: { id: userId, tenantId: tenantId }
        });
        if (!user) throw new NotFoundException('Staff not found in your tenant');

        // 3. Cek duplikasi
        const exists = await this.prisma.user_stores.findFirst({
            where: { storeId: storeId, userId: userId }
        });
        if (exists) throw new ConflictException('Staff already assigned to this store');

        return this.prisma.user_stores.create({
            data: {
                storeId: storeId,
                userId: userId,
            },
        });
    }

    async getMyAccess(user: { userId: string; tenantId: string; role: string }) {
        if (user.role === 'owner') {
            const allStores = await this.prisma.stores.findMany({
                where: { tenantId: user.tenantId },
                orderBy: { createdAt: 'desc' },
            });

            return allStores.map((store) => ({
                id: store.id,
                tenantId: store.tenantId,
                name: store.name,
                address: store.address,
                phone: store.phone,
                logo_url: store.logoUrl,
                receipt_header: store.receiptHeader,
                receipt_footer: store.receiptFooter,
                isActive: true, // Owner selalu dianggap aktif untuk semua tokonya
                createdAt: store.createdAt.toISOString(),
                updatedAt: store.updatedAt.toISOString(),
            }));
        }

        // 2. Jika Role adalah Staff/Manager, tarik hanya toko yang di-assign
        const access = await this.prisma.user_stores.findMany({
            where: {
                userId: user.userId,
                status: 'active'
            },
            include: {
                store: true,
            },
        });

        return access.map((item) => ({
            id: item.store.id,
            tenantId: item.store.tenantId,
            name: item.store.name,
            address: item.store.address,
            phone: item.store.phone,
            logo_url: item.store.logoUrl,
            receipt_header: item.store.receiptHeader,
            receipt_footer: item.store.receiptFooter,
            isActive: item.status === 'active',
            createdAt: item.store.createdAt.toISOString(),
            updatedAt: item.store.updatedAt.toISOString(),
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

    async findCurrentShift(storeId: string) {
        return await this.prisma.store_shifts.findFirst({
            where: {
                storeId: storeId,
                status: 'OPEN',
            },
            include: {
                user: { select: { name: true } },
            },
        });
    }
}