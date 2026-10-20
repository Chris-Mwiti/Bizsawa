module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // WatermelonDB models: strip TS types before the legacy decorators run.
    // The web transform otherwise rejects `field!: T` with "Definitely
    // assigned fields cannot be initialized here".
    overrides: [
      {
        test: /db[\\/]models[\\/].*\.ts$/,
        plugins: [
          ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
          ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
        ],
      },
    ],
    plugins: ['react-native-worklets/plugin'],
  }
}
