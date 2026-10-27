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
    //
    // transform-class-properties MUST run here, in loose mode, after the
    // decorators:
    //   - Legacy decorators require loose class properties.
    //   - On native, @react-native/babel-preset supplies that transform
    //     (loose: true). On web, babel-preset-expo uses its own web-preset,
    //     which has NO class-properties transform — so the fields stayed native
    //     and the decorators emitted `_initializerWarningHelper(descriptor,
    //     this)`. The @babel/runtime helper of that name is a stub that always
    //     throws "Decorating class property failed...", so EVERY model
    //     instantiation blew up on web (recording a sale, any write).
    //   - Listing it here also dedupes the native preset's copy (same plugin,
    //     same loose mode), so native output is unchanged.
    overrides: [
      {
        test: /db[\\/]models[\\/].*\.ts$/,
        plugins: [
          ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
          ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
        ],
      },
    ],
    plugins: ['react-native-worklets/plugin'],
  }
}
