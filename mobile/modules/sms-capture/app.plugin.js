// Config plugin for bizsawa-sms-capture. Adds the Play Services
// auth-api-phone artifact (SMS User Consent API) to the app build.
// No manifest permissions: the Consent API is permissionless — the user
// approves each message via a system dialog.
const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins')

const GMS_DEP = 'com.google.android.gms:play-services-auth-api-phone:18.1.0'

function withSmsCapture(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('play-services-auth-api-phone')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("${GMS_DEP}")`,
      )
    }
    return cfg
  })
}

module.exports = createRunOncePlugin(
  withSmsCapture,
  'bizsawa-sms-capture',
  '1.0.0',
)
