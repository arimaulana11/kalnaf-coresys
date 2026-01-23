@echo off
echo ==========================================
echo Generating Core Modules: Category & Product
echo ==========================================

:: 1. Generate Category Feature
call npx nest generate module modules/category
call npx nest generate service modules/category
call npx nest generate controller modules/category
mkdir src\modules\category\dto
type nul > src\modules\category\dto\create-category.dto.ts
type nul > src\modules\category\dto\update-category.dto.ts

:: 2. Generate Product Feature
call npx nest generate module modules/product
call npx nest generate service modules/product
call npx nest generate controller modules/product
mkdir src\modules\product\dto
type nul > src\modules\product\dto\create-product.dto.ts
type nul > src\modules\product\dto\update-product.dto.ts
type nul > src\modules\product\dto\product-query.dto.ts

echo ==========================================
echo Generation Complete! Fill the DTOs now.
echo ==========================================
pause