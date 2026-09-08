# EAS secrets & credentials — one-time setup (Phase A1 + D1)

# 1. Create secrets for each channel (run from mobile/)
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.dev.bizsawa.com/api/v1 --type string
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.staging.bizsawa.com/api/v1 --type string --env preview
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.bizsawa.com/api/v1 --type string --env production
eas secret:list

# 2. Android keystore
eas credentials --platform android
# Choose: Generate new keystore (managed). Backup the downloaded credentials.json + android.keystore — never commit.

# 3. Preview APK for sideload (internal)
eas build --platform android --profile preview --non-interactive
# Download: eas build:list → QR at expo.dev/accounts/<you>/projects/bizsawa-mobile/builds/<id>
# Share via: EAS internal distribution (email invite) or Firebase App Distribution:
# firebase appdistribution:distribute app.apk --app <firebase_app_id> --groups testers

# 4. Production AAB + submit
eas build --platform android --profile production --non-interactive
eas submit --platform android --profile production
# Requires Play serviceAccountKey.json — see play-listing.md
