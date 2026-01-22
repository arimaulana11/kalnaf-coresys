export class StoreEntity {
    id: string;
    tenant_id: string;
    name: string;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
    receipt_header: string | null;
    receipt_footer: string | null;

    // UBAH BAGIAN INI:
    is_active: boolean | null;

    created_at: Date | null;
    updated_at: Date | null;

    constructor(partial: Partial<StoreEntity>) {
        Object.assign(this, partial);
    }
}