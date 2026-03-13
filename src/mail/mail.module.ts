import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_PROVIDER') === 'sendgrid'
            ? 'smtp.sendgrid.net'
            : 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: config.get('MAIL_PROVIDER') === 'sendgrid'
              ? 'apikey'
              : config.get('GMAIL_USER'),
            pass: config.get('MAIL_PROVIDER') === 'sendgrid'
              ? config.get('SENDGRID_API_KEY')
              : config.get('GMAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('MAIL_FROM'),
        },
        template: {
          // Menggunakan __dirname agar fleksibel saat dev maupun prod
          dir: join(process.cwd(), 'dist', 'mail', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule { }