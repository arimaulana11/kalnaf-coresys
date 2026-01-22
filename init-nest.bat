@echo off
echo 🚀 Memulai pembuatan struktur NestJS untuk Kalnaf-coresys...

:: --- Buat Direktori Utama ---
mkdir src
mkdir src\config
mkdir src\common
mkdir src\common\decorators
mkdir src\common\filters
mkdir src\common\guards
mkdir src\common\interceptors
mkdir src\common\pipes
mkdir src\common\constants
mkdir src\common\utils
mkdir src\modules

:: --- Buat Direktori Modules Berdasarkan Postman ---
mkdir src\modules\auth
mkdir src\modules\auth\strategies
mkdir src\modules\auth\dto
mkdir src\modules\users
mkdir src\modules\users\dto
mkdir src\modules\users\entities
mkdir src\modules\stores
mkdir src\modules\stores\dto
mkdir src\modules\stores\entities
mkdir src\modules\health

:: --- Buat Direktori Infrastruktur ---
mkdir src\database
mkdir src\jobs
mkdir src\listeners
mkdir src\test

:: --- Buat File Root ---
type nul > src\main.ts
type nul > src\app.module.ts

:: --- Buat File Config ---
type nul > src\config\app.config.ts
type nul > src\config\database.config.ts
type nul > src\config\jwt.config.ts
type nul > src\config\index.ts

:: --- Buat File Common (Decorators, Guards, dll) ---
type nul > src\common\decorators\user.decorator.ts
type nul > src\common\decorators\tenant.decorator.ts
type nul > src\common\decorators\roles.decorator.ts
type nul > src\common\filters\http-exception.filter.ts
type nul > src\common\guards\jwt.guard.ts
type nul > src\common\guards\roles.guard.ts
type nul > src\common\interceptors\transform.interceptor.ts
type nul > src\common\pipes\validation.pipe.ts
type nul > src\common\constants\app.constant.ts

:: --- Module Auth (Login, Register, Refresh, Logout) ---
type nul > src\modules\auth\auth.module.ts
type nul > src\modules\auth\auth.controller.ts
type nul > src\modules\auth\auth.service.ts
type nul > src\modules\auth\strategies\jwt.strategy.ts
type nul > src\modules\auth\strategies\refresh-token.strategy.ts
type nul > src\modules\auth\dto\login.dto.ts
type nul > src\modules\auth\dto\register.dto.ts

:: --- Module Users (Add Staff, Get All Staff, Promotion, Inactive) ---
type nul > src\modules\users\users.module.ts
type nul > src\modules\users\users.controller.ts
type nul > src\modules\users\users.service.ts
type nul > src\modules\users\dto\create-staff.dto.ts
type nul > src\modules\users\dto\update-staff.dto.ts
type nul > src\modules\users\entities\user.entity.ts

:: --- Module Stores (Insert, Get All, Detail, Update, Assign Staff, My-Access) ---
type nul > src\modules\stores\stores.module.ts
type nul > src\modules\stores\stores.controller.ts
type nul > src\modules\stores\stores.service.ts
type nul > src\modules\stores\dto\create-store.dto.ts
type nul > src\modules\stores\dto\update-store.dto.ts
type nul > src\modules\stores\dto\assign-staff.dto.ts
type nul > src\modules\stores\entities\store.entity.ts

:: --- Module Health ---
type nul > src\modules\health\health.module.ts
type nul > src\modules\health\health.controller.ts

:: --- Database & Prisma ---
type nul > src\database\database.module.ts
type nul > src\database\prisma.service.ts

:: --- Lain-lain ---
type nul > src\test\app.e2e-spec.ts

echo.
echo ✔ Struktur NestJS Kalnaf-coresys berhasil dibuat!
echo 💡 Sesuai dengan koleksi Postman (Auth, Stores, Users, Health).
pause