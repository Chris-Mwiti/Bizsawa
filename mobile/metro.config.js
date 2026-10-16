const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Never watch native build outputs: watermelondb's android-jsi .cxx trees
// alone contain tens of thousands of files and exhaust the kernel's
// inotify budget (ENOSPC: file watchers limit), killing `android:lan`.
config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList] : []),
  /node_modules\/.*\/\.cxx\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
  /node_modules\/.*\/build\/.*/,
  /android\/build\/.*/,
  /android\/\.cxx\/.*/,
  /android\/app\/build\/.*/,
  /ios\/build\/.*/,
  /ios\/Pods\/.*/,
]

module.exports = withNativeWind(config, { input: './global.css' })
