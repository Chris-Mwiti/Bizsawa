import { Model } from '@nozbe/watermelondb'
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators'

export default class ProductVariant extends Model {
  static table = 'product_variants'

  @field('business_id')
  businessId!: string

  @field('product_id')
  productId!: string

  @text('name')
  name!: string

  @field('sku')
  sku?: string

  @field('barcode')
  barcode?: string

  @field('price')
  price!: string

  @field('cost')
  cost!: string

  @field('is_active')
  isActive!: boolean

  @field('sync_version')
  syncVersion!: number

  @field('deleted_at')
  deletedAt?: number

  @readonly
  @date('created_at')
  createdAt!: Date

  @readonly
  @date('updated_at')
  updatedAt!: Date
}
