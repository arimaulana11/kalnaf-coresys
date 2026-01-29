# Kalnaf Coresys - SaaS Multi-tenant Engine

**Kalnaf Coresys** adalah sistem backend core berbasis [NestJS](https://github.com/nestjs/nest) yang dirancang untuk skala **SaaS (Software as a Service)**. Proyek ini menggunakan arsitektur **Multi-tenancy** dengan pendekatan *Shared Database*, di mana beberapa penyewa (tenants) berbagi database yang sama namun datanya terisolasi secara logis.

## 🏗️ Arsitektur Multi-tenancy

Proyek ini menerapkan isolasi data pada layer aplikasi dan database:

* **Shared Database, Shared Schema:** Semua tenant berada dalam satu database untuk efisiensi biaya dan kemudahan maintenance.
* **Row-Level Isolation:** Setiap tabel yang memiliki data sensitif tenant dilengkapi dengan kolom `tenantId`.
* **Tenant Middleware/Guard:** Mengidentifikasi tenant berdasarkan *subdomain*, *custom header*, atau *JWT Payload*.
* **Prisma Middleware/Extensions:** Secara otomatis memfilter query berdasarkan `tenantId` yang aktif untuk mencegah kebocoran data antar tenant.

---

## 🚀 Fitur SaaS

* **Tenant Management:** Pendaftaran dan aktivasi tenant baru secara dinamis.
* **RBAC (Role-Based Access Control):** Pengaturan role yang berbeda untuk tiap user di dalam tenant.
* **Subscription Logic:** Kesiapan integrasi untuk paket langganan (Free, Pro, Enterprise).
* **Shared Resources:** Optimasi penggunaan resource server untuk melayani ribuan tenant sekaligus.

---

## 🛠️ Persiapan & Instalasi

### 1. Konfigurasi Database

Pastikan schema Prisma Anda sudah mendukung `tenantId`. Contoh migrasi:

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  tenantId  String   // Identifikasi kepemilikan data
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
}

```

### 2. Instalasi

```bash
npm install

```

### 3. Setup Lingkungan (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/kalnaf_db"
JWT_SECRET="your-super-secret-key"
APP_DOMAIN="kalnaf.io"

```

---

## 📜 Skrip Operasional

| Perintah | Deskripsi |
| --- | --- |
| `npm run start:dev` | Menjalankan server lokal dengan hot-reload. |
| `npm run build` | Kompilasi project untuk produksi & generate Prisma client. |
| `npm run prisma:generate` | Sinkronisasi Prisma client dengan schema terbaru. |
| `npm run test:e2e` | Menjalankan pengujian integrasi antar tenant. |

---

## 🛡️ Keamanan & Validasi

Aplikasi ini menggunakan pengamanan berlapis:

1. **Passport JWT:** Autentikasi user.
2. **Tenant Guard:** Memastikan user hanya bisa mengakses resource milik `tenantId` mereka.
3. **Class Validator:** Validasi DTO untuk memastikan data yang masuk bersih dan sesuai tipe.

---

## 📄 Lisensi

Proyek ini bersifat **UNLICENSED** (Privat).
