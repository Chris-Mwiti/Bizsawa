// Config plugin for bizsawa-sms-capture. Adds the Play Services
// auth-api-phone artifact (SMS User Consent API) to the app build.
// No manifest permissions: the Consent API is permissionless — the user
// approves each message via a system dialog.
const { withAppBuildGradle, withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins')

const GMS_DEP = 'com.google.android.gms:play-services-auth-api-phone:18.1.0'

function withSmsCapture(config) {
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('play-services-auth-api-phone')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("${GMS_DEP}")`,
      )
    }
    return cfg
  })
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    if (!manifest['uses-permission']) manifest['uses-permission'] = []
    const perms = manifest['uses-permission']
    if (!perms.some((p) => p.$?.['android:name'] === 'android.permission.RECEIVE_SMS')) {
      perms.push({ $: { 'android:name': 'android.permission.RECEIVE_SMS' } })
    }
    return cfg
  })
  return config
}

module.exports = createRunOncePlugin(
  withSmsCapture,
  'bizsawa-sms-capture',
  '1.0.0',
)
