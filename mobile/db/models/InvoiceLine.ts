import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'
export default class InvoiceLine extends Model {
  static table = 'invoice_lines'
  @field('business_id') businessId!: string
  @field('invoice_id') invoiceId!: string
  @field('product_id') productId?: string
  @field('description') description!: string
  @field('quantity') quantity!: string
  @field('unit_price') unitPrice!: string
  @field('line_total') lineTotal!: string
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number
  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
}
