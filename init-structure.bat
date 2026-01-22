@echo off

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
mkdir src\modules\auth
mkdir src\modules\auth\strategies
mkdir src\modules\auth\dto
mkdir src\modules\users
mkdir src\modules\users\dto
mkdir src\modules\users\entities
mkdir src\modules\tenants
mkdir src\modules\tenants\entities
mkdir src\modules\health
mkdir src\database
mkdir src\jobs
mkdir src\listeners
mkdir src\migrations
mkdir src\test

type nul > src\main.ts
type nul > src\app.module.ts

type nul > src\config\app.config.ts
type nul > src\config\database.config.ts
type nul > src\config\jwt.config.ts
type nul > src\config\index.ts

type nul > src\common\decorators\user.decorator.ts
type nul > src\common\decorators\tenant.decorator.ts
type nul > src\common\filters\http-exception.filter.ts
type nul > src\common\guards\jwt.guard.ts
type nul > src\common\guards\tenant.guard.ts
type nul > src\common\interceptors\logging.interceptor.ts
type nul > src\common\interceptors\transform.interceptor.ts
type nul > src\common\pipes\validation.pipe.ts
type nul > src\common\constants\app.constant.ts
type nul > src\common\utils\date.util.ts

type nul > src\modules\auth\auth.module.ts
type nul > src\modules\auth\auth.controller.ts
type nul > src\modules\auth\auth.service.ts
type nul > src\modules\auth\strategies\jwt.strategy.ts
type nul > src\modules\auth\dto\login.dto.ts
type nul > src\modules\auth\dto\register.dto.ts

type nul > src\modules\users\users.module.ts
type nul > src\modules\users\users.controller.ts
type nul > src\modules\users\users.service.ts
type nul > src\modules\users\dto\create-user.dto.ts
type nul > src\modules\users\dto\update-user.dto.ts
type nul > src\modules\users\entities\user.entity.ts

type nul > src\modules\tenants\tenants.module.ts
type nul > src\modules\tenants\tenants.controller.ts
type nul > src\modules\tenants\tenants.service.ts
type nul > src\modules\tenants\entities\tenant.entity.ts

type nul > src\modules\health\health.module.ts
type nul > src\modules\health\health.controller.ts

type nul > src\database\database.module.ts
type nul > src\database\prisma.service.ts

type nul > src\jobs\reward-expired.job.ts
type nul > src\listeners\user-created.listener.ts
type nul > src\test\app.e2e-spec.ts

echo ✔ NestJS structure created successfully
pause
