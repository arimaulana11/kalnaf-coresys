export interface TransactionMetadata {
  notes?: string | null;
  promoCode?: string | null;
  terminalId?: string | null;
  bank_name?: string | null;
  reference_no?: string | null;
  void_reason?: string | null;
  void_at?: string | Date | null;
  void_by?: string | null;
}