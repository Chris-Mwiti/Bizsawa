// Canonical device-test SMS vectors. Byte-identical to the REAL Kotlin
// fixtures (MpesaFixtures TILL_1 / PAYBILL_1 / POCHI_1 / POCHI_2) so the TS parser,
// the native parser, and the backend ingest path are all exercised against
// the same strings. Paste a genuine phone message over any of these on the
// sms-test screen to fail fast on real traffic.

export interface SmsTemplate {
  id: 'till' | 'paybill' | 'pochi' | 'pochi-nophone'
  label: string
  sender: string
  body: string
}

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: 'till',
    label: 'Till receive',
    sender: 'MPESA',
    body: 'QHX7K2M9AB Confirmed. Ksh1,234.50 received from JOHN DOE 0712345678 on 08/10/2026 at 09:41 AM. Till No. 567890. New business balance is Ksh10,000.00.',
  },
  {
    id: 'paybill',
    label: 'Paybill receive',
    sender: 'MPESA',
    body: 'QJ2M8XZ4PL Confirmed. Ksh2,500.00 received from JANE DOE 0722000111 on 08/10/2026 at 11:02 AM. Paybill No. 600100, Account No. SHOP12. New utility balance is Ksh45,000.00.',
  },
  {
    id: 'pochi',
    label: 'Pochi La Biashara receive',
    sender: 'MPESA',
    body: 'PK7T2M9QW1 Confirmed. You have received Ksh350.00 from 0733000222 MARY WANJIKU on 08/10/2026 at 01:15 PM. Pochi La Biashara balance is Ksh5,200.00.',
  },
  {
    id: 'pochi-nophone',
    label: 'Pochi name-only receive',
    sender: 'MPESA',
    body: 'UJEEIA0XPR Confirmed.You have received Ksh10.00 from JOHN  DOE on 14/10/26 at 2:24 PM  New Pochi balance is Ksh10.00. To access your funds, Dial *334#,select Pochi la Biashara & Withdraw funds.',
  },
]
