export type MailProvider = 'gmail' | 'sendgrid';

export interface MailConfig {
  provider: MailProvider;
  from: string;
  apiKey?: string;
  user?: string;
  pass?: string;
}