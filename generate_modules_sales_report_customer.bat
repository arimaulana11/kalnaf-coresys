@echo off
SETLOCAL EnableExtensions

echo ====================================================
echo Generating NestJS Modules: Transactions, Customer, Report
echo ====================================================

:: 1. Generate Transactions Module
echo [1/3] Creating Transactions Module...
call npx @nestjs/cli generate module modules/transactions --no-spec
call npx @nestjs/cli generate controller modules/transactions --no-spec
call npx @nestjs/cli generate service modules/transactions --no-spec

if not exist "src\modules\transactions\dto" mkdir "src\modules\transactions\dto"
type nul > "src\modules\transactions\dto\create-transaction.dto.ts"

:: 2. Generate Customer Module
echo [2/3] Creating Customer Module...
call npx @nestjs/cli generate module modules/customer --no-spec
call npx @nestjs/cli generate controller modules/customer --no-spec
call npx @nestjs/cli generate service modules/customer --no-spec

if not exist "src\modules\customer\dto" mkdir "src\modules\customer\dto"
type nul > "src\modules\customer\dto\create-customer.dto.ts"

:: 3. Generate Report Module
echo [3/3] Creating Report Module...
call npx @nestjs/cli generate module modules/report --no-spec
call npx @nestjs/cli generate controller modules/report --no-spec
call npx @nestjs/cli generate service modules/report --no-spec

if not exist "src\modules\report\dto" mkdir "src\modules\report\dto"
type nul > "src\modules\report\dto\query-report.dto.ts"

echo ====================================================
echo All Modules Generated Successfully!
echo ====================================================
pause