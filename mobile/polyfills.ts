// MUST be imported before any `import { v4 as uuidv4 } from 'uuid'` usage
// React Native (Hermes) has no `crypto.getRandomValues` — uuid@8+ requires it
// This polyfills global.crypto.getRandomValues via react-native-get-random-values
import 'react-native-get-random-values'
