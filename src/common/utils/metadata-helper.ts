import { TransactionMetadata } from "src/modules/transactions/interfaces/transaction.interface";

export function mapMetadata(rawMetadata: any): TransactionMetadata {
  // Casting rawMetadata ke interface kita
  const meta = (rawMetadata as TransactionMetadata) || {};
  
  return {
    notes: meta.notes ?? '-',
    promoCode: meta.promoCode ?? null,
    terminalId: meta.terminalId ?? 'N/A',
    // Cukup panggil meta.bank_name, jangan panggil meta.metadata lagi
    bank_name: meta.bank_name ?? '-', 
    reference_no: meta.reference_no ?? '-',
    void_reason: meta.void_reason ?? null,
    void_at: meta.void_at ?? null,
    void_by: meta.void_by ?? null,
  };
}