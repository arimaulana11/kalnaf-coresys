// src/products/products.controller.ts
import { Controller, Post, Get, Body, UseGuards, Request, Query, Param, ParseIntPipe, Req, Patch, Delete, Headers as NestHeaders } from '@nestjs/common';
import { ProductsService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CreateVariantDto } from './dto/varian-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ImportProductDto } from 'src/modules/product/dto/import-product.dto';
import { VariantIdParamDto } from './dto/remove-variant.dto';
import { ProductIdParamDto } from './dto/delete-product.dto';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('products')
@UseGuards(JwtGuard, RolesGuard)
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Post()
    @Roles('owner')
    async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProductDto) {
        // tenantId diambil dari payload JWT yang diletakkan oleh Passport di req.user
        return this.productsService.create(req.user.tenantId, dto);
    }

    @Get()
    @Roles('owner')
    async findAll(
        @Request() req,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('category_id') categoryId?: string,
    ) {
        return this.productsService.findAll(req.user.tenantId, {
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 10,
            search,
            categoryId: categoryId ? parseInt(categoryId) : undefined,
        });
    }

    @Get('search')
    @Roles('owner')
    async search(@Request() req, @Query('q') queryText: string) {
        // Jika parameter 'q' kosong, kembalikan array kosong atau berikan error
        if (!queryText) return [];

        return this.productsService.search(req.user.tenantId, queryText);
    }

    @Patch('product-variants/:id')
    @Roles('owner')
    async updateVariant(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateVariantDto,
        @Request() req: AuthenticatedRequest,
    ) {
        return this.productsService.updateVariant(req.user.tenantId, id, dto);
    }

    @Post(':id/variants')
    @Roles('owner')
    async addVariant(
        @Param('id', ParseIntPipe) productId: number,
        @Body() dto: CreateVariantDto,
        @Request() req
    ) {
        return this.productsService.addVariant(req.user.tenantId, productId, dto);
    }

    @Get(':id')
    @Roles('owner')
    async findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
        return this.productsService.findOne(req.user.tenantId, id);
    }

    @Patch(':id')
    @Roles('owner')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateProductDto,
        @Request() req,
    ) {
        return this.productsService.update(req.user.tenantId, id, dto);
    }

    @Delete('variants/:id')
    @Roles('owner')
    async removeVariant(
        @Param() params: VariantIdParamDto,
        @Req() req,
    ) {
        const tenantId = req.user.tenantId;
        return this.productsService.removeVariant(params.id, tenantId);
    }

    @Delete(':id/force')
    @Roles('owner')
    async forceDeleteProduct(
        @Param() params: ProductIdParamDto,
        @Req() req,
    ) {
        const tenantId = req.user.tenantId;
        return this.productsService.forceDelete(params.id, tenantId);
    }

    @Delete(':id')
    @Roles('owner')
    async remove(
        @Param('id', ParseIntPipe) id: number,
        @Request() req
    ) {
        return this.productsService.remove(req.user.tenantId, id);
    }

    @Post('import')
    @Roles('owner')
    async importProducts(
        @Body() dto: ImportProductDto[],
        @Req() req,
        @NestHeaders('store-id') storeId: string, // Gunakan nama alias di sini
    ) {
        const tenantId = req.user.tenantId;
        return this.productsService.bulkImport(tenantId, storeId, dto);
    }
}