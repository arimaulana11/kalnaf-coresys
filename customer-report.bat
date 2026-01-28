@echo off
SET /P modname="Masukkan Nama Module (contoh: reports atau customers): "

echo Memulai pembuatan module %modname%...

:: 1. Buat Folder Struktur
mkdir src\modules\%modname%
mkdir src\modules\%modname%\dto
mkdir src\modules\%modname%\interfaces

:: 2. Buat File Module
echo import { Module } from '@nestjs/common'; > src\modules\%modname%\%modname%.module.ts
echo import { %modname%Controller } from './%modname%.controller'; >> src\modules\%modname%\%modname%.module.ts
echo import { %modname%Service } from './%modname%.service'; >> src\modules\%modname%\%modname%.module.ts
echo. >> src\modules\%modname%\%modname%.module.ts
echo @Module({ >> src\modules\%modname%\%modname%.module.ts
echo   controllers: [%modname%Controller], >> src\modules\%modname%\%modname%.module.ts
echo   providers: [%modname%Service], >> src\modules\%modname%\%modname%.module.ts
echo }) >> src\modules\%modname%\%modname%.module.ts
echo export class %modname%Module {} >> src\modules\%modname%\%modname%.module.ts

:: 3. Buat File Service (Template Dasar)
echo import { Injectable } from '@nestjs/common'; > src\modules\%modname%\%modname%.service.ts
echo import { PrismaService } from '../../database/prisma.service'; >> src\modules\%modname%\%modname%.service.ts
echo. >> src\modules\%modname%\%modname%.service.ts
echo @Injectable() >> src\modules\%modname%\%modname%.service.ts
echo export class %modname%Service { >> src\modules\%modname%\%modname%.service.ts
echo   constructor(private prisma: PrismaService) {} >> src\modules\%modname%\%modname%.service.ts
echo } >> src\modules\%modname%\%modname%.service.ts

:: 4. Buat File Controller (Template Dasar)
echo import { Controller, Get, UseGuards } from '@nestjs/common'; > src\modules\%modname%\%modname%.controller.ts
echo import { %modname%Service } from './%modname%.service'; >> src\modules\%modname%\%modname%.controller.ts
echo import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; >> src\modules\%modname%\%modname%.controller.ts
echo. >> src\modules