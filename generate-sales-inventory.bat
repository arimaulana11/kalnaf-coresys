@echo off
echo ====================================================
echo Generating POS Core Modules (Inventory & Sales)
echo ====================================================

:: --- INVENTORY MODULE ---
mkdir src\modules\inventory\dto
echo. > src\modules\inventory\inventory.controller.ts
echo. > src\modules\inventory\inventory.service.ts
echo. > src\modules\inventory\dto\stock-in.dto.ts
echo. > src\modules\inventory\dto\stock-adjustment.dto.ts

:: --- SALES MODULE ---
mkdir src\modules\sales\dto
echo. > src\modules\sales\sales.controller.ts
echo. > src\modules\sales\sales.service.ts
echo. > src\modules\sales\dto\create-transaction.dto.ts

:: --- REPORT MODULE (Untuk Daily Summary) ---
mkdir src\modules\report
echo. > src\modules\report\report.controller.ts
echo. > src\modules\report\report.service.ts

echo Folders and empty files created!
echo Next steps: Register modules in app.module.ts
pause