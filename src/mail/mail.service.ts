import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  /**
   * Fungsi umum untuk mengirim email menggunakan template
   */
  async sendSystemEmail(to: string, subject: string, template: string, context: any) {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template: `./${template}`, // Akan mencari file di folder templates
        context,
      });
      return { success: true };
    } catch (error) {
      console.error('Email Error:', error);
      throw new InternalServerErrorException('Gagal mengirim email');
    }
  }

  /**
   * Fungsi khusus untuk Struk POS (opsional, jika ingin dipisah)
   */
  async sendReceipt(to: string, data: any) {
    return this.sendSystemEmail(to, `Struk Pembayaran #${data.transactionId}`, 'receipt', data);
  }
}