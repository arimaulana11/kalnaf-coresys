#!/bin/bash

# Definisikan direktori dasar modul product
PRODUCT_DIR="src/product"
ENTITY_DIR="$PRODUCT_DIR/entities"

# Membuat folder jika belum ada
mkdir -p $ENTITY_DIR

echo "Checking and creating missing files..."

# 1. Create Parcel Item Entity
if [ ! -f "$ENTITY_DIR/parcel-item.entity.ts" ]; then
    cat <<EOT >> "$ENTITY_DIR/parcel-item.entity.ts"
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ProductVariant } from './product-variant.entity';

@Entity()
export class ParcelItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  parcelVariantId: number;

  @Column()
  componentVariantId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  qty: number;

  @ManyToOne(() => ProductVariant, (variant) => variant.parcelItems)
  @JoinColumn({ name: 'parcelVariantId' })
  parcelVariant: ProductVariant;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'componentVariantId' })
  component: ProductVariant;
}
EOT
    echo "✅ Created parcel-item.entity.ts"
else
    echo "⚠️  parcel-item.entity.ts already exists. Skipping."
fi

# 2. Perhatian: Pastikan ProductVariant Entity diupdate secara manual untuk menambahkan:
# @OneToMany(() => ParcelItem, (parcelItem) => parcelItem.parcelVariant)
# parcelItems: ParcelItem[];

# 3. Create/Update Product Module (Pastikan TypeOrmModule menyertakan ParcelItem)
if [ -f "$PRODUCT_DIR/product.module.ts" ]; then
    echo "📝 Remember to add ParcelItem to TypeOrmModule.forFeature([...]) in product.module.ts"
fi

echo "Done! Jangan lupa jalankan 'npm run build' untuk memastikan tidak ada error pada relasi entity."