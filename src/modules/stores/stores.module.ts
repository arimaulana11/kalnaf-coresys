import { Module } from '@nestjs/common'
import { StoresController } from './stores.controller'
import { StoresService } from './stores.service'
import { DatabaseModule } from '../../database/database.module'; // Pastikan path ini benar

@Module({
    imports: [DatabaseModule],
    controllers: [StoresController],
    providers: [StoresService],
    exports: [StoresService],
})
export class StoresModule { }
