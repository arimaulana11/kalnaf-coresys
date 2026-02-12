import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { GetVariantsFilterDto } from './dto/get-variants-filter.dto';
import { ProductVariantsService } from './product-variants.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../auth/interface/auth-user.interface';
import { Roles } from '../../common/decorators/roles.decorator';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@Controller('product-variants')
@UseGuards(JwtGuard, RolesGuard)
export class VariantsController {
  constructor(private readonly variantsService: ProductVariantsService) { }

  @Get()
  @Roles('owner')
  findAll(
    @Query() filterDto: GetVariantsFilterDto,
    @Req() req: AuthenticatedRequest
  ) {
    const tenantId = req.user.tenantId;
    return this.variantsService.findAll(filterDto, tenantId);
  }
}