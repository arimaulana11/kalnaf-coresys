import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportDto } from './dto/create-support.dto';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthUser } from '../auth/interface/auth-user.interface';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@Controller('support')
@UseGuards(JwtGuard, RolesGuard)
export class SupportController {
    constructor(private readonly supportService: SupportService) { }

    /**
     * [POST] /api/support
     * Endpoint untuk menerima pengaduan dari HelpCenterButton (Frontend)
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles('owner')
    async create(@Body() createSupportDto: CreateSupportDto, @Req() req: AuthenticatedRequest) {
        /**
         * tenantId diambil dari payload JWT yang sudah di-decode oleh Passport/Guard.
         * Pastikan di strategi JWT Anda, tenantId sudah dimasukkan ke dalam req.user.
         */
        const tenantId = req.user.tenantId || 'GUEST';

        return this.supportService.create(createSupportDto, tenantId);
    }
}