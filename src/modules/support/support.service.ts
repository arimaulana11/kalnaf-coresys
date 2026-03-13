import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // Tambahkan ini
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupportDto } from './dto/create-support.dto';

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService, // Inject ConfigService
  ) { }

  private async getSheet() {
    // Ambil data dari ENV
    const email = this.configService.get<string>('GOOGLE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    const sheetId = this.configService.get<string>('GOOGLE_SHEET_ID') || '';
    
    const serviceAccountAuth = new JWT({
      email: email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();
    return doc.sheetsByIndex[0];
  }

  async create(createSupportDto: CreateSupportDto, tenantId: string) {
    try {
      // 1. Cari nama tenant berdasarkan ID
      const tenant = await this.prisma.tenants.findUnique({
        where: { id: tenantId },
        select: { name: true }
      });

      const tenantName = tenant?.name || 'Unknown Tenant';

      // 2. Hubungkan ke Google Sheets melalui helper method
      const sheet = await this.getSheet();

      // 3. Tambahkan baris
      const newRow = await sheet.addRow({
        Tanggal: new Date().toLocaleString('id-ID'),
        TenantName: tenantName,
        Nama: createSupportDto.name,
        Email: createSupportDto.email,
        WhatsApp: createSupportDto.whatsapp,
        Deskripsi: createSupportDto.description,
        Status: 'PENDING',
      });

      return {
        success: true,
        message: 'Laporan berhasil dicatat',
        row: newRow.rowNumber
      };
    } catch (error: any) {
      console.error('Support Service Error:', error);
      throw new InternalServerErrorException('Gagal memproses laporan bantuan');
    }
  }
}