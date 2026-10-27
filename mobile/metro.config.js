const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Never watch native build outputs: watermelondb's android-jsi .cxx trees
// alone contain tens of thousands of files and exhaust the kernel's
// inotify budget (ENOSPC: file watchers limit), killing `android:lan`.
// NOTE: blockList must stay a single RegExp — Metro refuses to combine an
// array of RegExps whose flags differ from Expo's pre-combined default.
const extraIgnoreSources = [
  /node_modules\/.*\/\.cxx\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
  /android\/build\/.*/,
  /android\/\.cxx\/.*/,
  /android\/app\/build\/.*/,
  /ios\/build\/.*/,
  /ios\/Pods\/.*/,
].map((r) => r.source)

const baseBlockList = config.resolver.blockList
const baseSources = Array.isArray(baseBlockList)
  ? baseBlockList.map((r) => r.source)
  : [baseBlockList.source]

config.resolver.blockList = new RegExp(
  [...baseSources, ...extraIgnoreSources].join('|')
)

module.exports = withNativeWind(config, { input: './global.css' })
