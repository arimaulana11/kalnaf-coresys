import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupportDto } from './dto/create-support.dto';
import googleAuth from '../../google-auth.json';

@Injectable()
export class SupportService {
  private doc: GoogleSpreadsheet;

  constructor(private prisma: PrismaService) {
    const serviceAccountAuth = new JWT({
      email: googleAuth.client_email,
      key: googleAuth.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.doc = new GoogleSpreadsheet('1Wkfx64AMLVFDNup-yat6AspZv7ZX8-UGgnEWGTvrrLI', serviceAccountAuth);
  }

  async create(createSupportDto: CreateSupportDto, tenantId: string) {
    try {
      // 1. Cari nama tenant berdasarkan ID dari schema Prisma
      const tenant = await this.prisma.tenants.findUnique({
        where: { id: tenantId },
        select: { name: true }
      });

      const tenantName = tenant?.name || 'Unknown Tenant';

      // 2. Hubungkan ke Google Sheets
      await this.doc.loadInfo();
      const sheet = this.doc.sheetsByIndex[0];

      // 3. Tambahkan baris dengan TenantName hasil lookup
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