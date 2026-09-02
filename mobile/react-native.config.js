// Fix simdjson duplicate pod on iOS with WatermelonDB + Expo SDK 54
// https://github.com/morrowdigital/watermelondb-expo-plugin/issues/53
module.exports = {
  dependencies: {
    '@nozbe/simdjson': {
      platforms: {
        ios: null,
      },
    },
  },
}
