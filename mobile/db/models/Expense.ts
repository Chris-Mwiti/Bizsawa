import { Model } from '@nozbe/watermelondb'
import {
  field,
  text,
  date,
  readonly,
  writer,
} from '@nozbe/watermelondb/decorators'

export default class Expense extends Model {
  static table = 'expenses'

  @field('business_id') businessId!: string
  @text('category') category!: string
  @text('description') description?: string
  @field('vendor') vendor?: string
  @field('amount') amount!: string
  @field('tax_amount') taxAmount!: string
  @field('is_recurring') isRecurring!: boolean
  @field('recurring_interval') recurringInterval?: string
  @field('spent_at') spentAt!: number
  @field('created_by') createdBy?: string
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number

  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date

  @writer async markDeletedLocal() {
    await this.update((r: any) => {
      r.deletedAt = Date.now()
    })
    await this.markAsDeleted()
  }
}
