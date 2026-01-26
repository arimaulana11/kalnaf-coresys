import {
    Controller, Get, Post, Body, Patch, Param, Delete,
    Query, ParseIntPipe, Req,
    UseGuards
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryQueryDto } from './dto/category-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('categories')
@UseGuards(JwtGuard, RolesGuard)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    // ENDPOINT KHUSUS SEARCH: /api/categories/search?name=beras
    @Get('search')
    @Roles('owner')
    search(@Query() query: CategoryQueryDto, @Req() req: AuthenticatedRequest) {
        return this.categoryService.search(req.user.tenantId, query.name);
    }

    @Post()
    @Roles('owner')
    create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: AuthenticatedRequest) {
        return this.categoryService.create(createCategoryDto, req.user.tenantId);
    }

    @Get()
    @Roles('owner')
    findAll(@Req() req: AuthenticatedRequest) {
        return this.categoryService.findAll(req.user.tenantId);
    }

    @Get(':id')
    @Roles('owner')
    findOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
        return this.categoryService.findOne(id, req.user.tenantId);
    }

    @Patch(':id')
    @Roles('owner')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateCategoryDto: UpdateCategoryDto,
        @Req() req: AuthenticatedRequest
    ) {
        return this.categoryService.update(id, updateCategoryDto, req.user.tenantId);
    }

    @Delete(':id')
    @Roles('owner')
    remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
        return this.categoryService.remove(id, req.user.tenantId);
    }
}