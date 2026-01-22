import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreEntity } from './entities/store.entity';

@Injectable()
export class StoresService {
    constructor(private prisma: PrismaService) { }

    /**
     * Membuat Toko baru dan otomatis mendaftarkan Owner ke toko tersebut
     */
    async create(tenantId: string, userId: string, dto: CreateStoreDto) {
        // 1. Cek apakah nama toko sudah ada di tenant ini
        const existingStore = await this.prisma.store.findFirst({
            where: {
                tenant_id: tenantId,
                name: dto.name,
            },
        });

        if (existingStore) {
            // Pesan yang lebih manusiawi
            throw new ConflictException(
                `Maaf, toko dengan nama '${dto.name}' sudah terdaftar. Silakan gunakan nama lain.`
            );
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                // 2. Proses pembuatan store
                const store = await tx.store.create({
                    data: {
                        ...dto,
                        tenant_id: tenantId,
                        // tambahkan field lain jika perlu
                    },
                });

                return store;
            });
        } catch (error) {
            // Jika ada error tak terduga lainnya
            throw new InternalServerErrorException(
                'Terjadi kesalahan saat menyimpan data toko. Silakan coba beberapa saat lagi.'
            );
        }
    }

    /**
     * Mengambil semua toko milik satu Tenant
     */
    async findAll(tenantId: string, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        // Ambil data dan total count secara bersamaan
        const [stores, totalItems] = await Promise.all([
            this.prisma.store.findMany({
                where: { tenant_id: tenantId },
                skip: skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                },
            }),
            this.prisma.store.count({
                where: { tenant_id: tenantId }
            })
        ]);

        const totalPages = Math.ceil(totalItems / limit);

        return {
            // Map setiap store ke StoreEntity agar class-transformer bekerja
            items: stores.map((store) => new StoreEntity(store)),
            meta: {
                totalItems,
                itemCount: stores.length,
                itemsPerPage: limit,
                totalPages,
                currentPage: page,
            },
        };
    }

    /**
     * Mengambil detail toko spesifik dengan pengecekan tenant_id
     */
    async findOne(tenantId: string, id: string): Promise<StoreEntity> {
        const store = await this.prisma.store.findFirst({
            where: {
                id: id,
                tenant_id: tenantId // Keamanan: Pastikan toko milik tenant yang login
            },
        });

        if (!store) {
            throw new NotFoundException(`Store dengan ID ${id} tidak ditemukan atau bukan milik Anda`);
        }

        return new StoreEntity(store);
    }

    /**
     * Update data toko
     */
    async update(tenantId: string, id: string, dto: UpdateStoreDto): Promise<StoreEntity> {
        // Pastikan toko ada dan milik tenant tersebut sebelum update
        await this.findOne(tenantId, id);

        const updatedStore = await this.prisma.store.update({
            where: { id: id },
            data: dto,
        });

        return new StoreEntity(updatedStore);
    }

    /**
     * Menugaskan Staff ke Toko (Assign UserStore)
     */
    async assignStaff(tenantId: string, storeId: string, staffUserId: string) {
        // 1. Validasi: Apakah toko tersebut milik tenant?
        await this.findOne(tenantId, storeId);

        // 2. Validasi: Apakah staff yang diassign berada di tenant yang sama?
        const staff = await this.prisma.user.findFirst({
            where: { id: staffUserId, tenant_id: tenantId }
        });

        if (!staff) {
            throw new ForbiddenException('User tidak ditemukan atau tidak berada dalam organisasi Anda');
        }

        return await this.prisma.userStore.upsert({
            where: {
                user_id_store_id: {
                    user_id: staffUserId,
                    store_id: storeId,
                },
            },
            update: { status: 'active' },
            create: {
                user_id: staffUserId,
                store_id: storeId,
                status: 'active',
            },
        });
    }

    async getMyAccess(userId: string, role: string, tenantId: string) {
        // Jika dia Owner, ambil semua toko di bawah Tenant-nya
        if (role === 'owner') {
            return await this.prisma.store.findMany({
                where: { tenant_id: tenantId },
            });
        }

        // Jika Manager/Staff, ambil toko yang di-assign saja
        const access = await this.prisma.userStore.findMany({
            where: {
                user_id: userId,
                status: 'active'
            },
            include: { store: true }
        });

        return access.map(a => a.store);
    }
}