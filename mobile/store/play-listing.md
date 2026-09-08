# Play Console — BizSawa (com.bizsawa.mobile)

> Target: internal track → closed → production. EAS `eas build --profile production` produces AAB (targetSdk 35).

## Store listing
- **Name:** BizSawa — Business Manager
- **Short description (80):** Sales, stock, orders, invoices & M-Pesa — works offline.
- **Full description:** BizSawa helps Kenyan small businesses manage sales, stock, orders, customers, expenses and invoices. Create products with variants (500g/1kg), adjust inventory, capture orders, auto-generate sales and invoices, collect via M-Pesa STK Push, track expenses and analytics (day/week/month/year). Works fully offline via WatermelonDB; syncs when back online. Premium unlocks 5 businesses, AI + full analytics (KES 399/mo via isolated M-Pesa).
- **Category:** Business
- **Contact:** support@bizsawa.com
- **Privacy policy URL:** https://bizsawa.com/privacy (add before submission)
- **Graphics:** icon-light.png (512), splash #F4F9F7, screenshots 6.5" + 10" tablet.

## Data safety (form answers)
- **Data collected:** Phone, email, business name, transaction amounts — for app functionality, M-Pesa payments. Encrypted at rest, not shared with third parties except Safaricom Daraja for payments, WAHA for WhatsApp (opt-in).
- **Permissions:** INTERNET, ACCESS_NETWORK_STATE; no location/camera unless added later.

## Tracks
- **Internal testing:** add testers emails in Play Console → Testing → Internal → Testers. Share EAS build link `expo.dev/accounts/<you>/projects/bizsawa-mobile/builds/<id>` or `apk` via Firebase App Distribution.
- **Credentials:** `eas credentials --platform android` auto-generates keystore; back up `android.keystore`, `credentials.json`. `eas submit --platform android` uses `serviceAccountKey.json` (Play Console → Setup → API access → Link project → Create service account).

## Pre-launch checklist (from sage F1)
- [ ] `app.json` version 1.0.0 → EAS autoIncrement true for production
- [ ] Remove `NSAllowsLocalNetworking` for prod (currently true for dev; overridden via build profile)
- [ ] Data safety + Content rating (Everyone) completed
- [ ] `eas build --profile production` → AAB, `eas submit` to internal
