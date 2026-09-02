import { Model } from '@nozbe/watermelondb'
import { field, text, date, readonly, writer } from '@nozbe/watermelondb/decorators'
export default class Invoice extends Model {
  static table = 'invoices'
  @field('business_id') businessId!: string
  @field('customer_id') customerId?: string
  @field('invoice_number') invoiceNumber!: string
  @field('status') status!: string
  @field('subtotal') subtotal!: string
  @field('tax_amount') taxAmount!: string
  @field('total') total!: string
  @field('amount_paid') amountPaid!: string
  @field('amount_due') amountDue!: string
  @field('currency') currency!: string
  @text('notes') notes?: string
  @field('due_at') dueAt?: number
  @field('sent_at') sentAt?: number
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number
  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
  @writer async markDeletedLocal(){ await this.update((r:any)=>{r.deletedAt=Date.now()}); await this.markAsDeleted() }
}
