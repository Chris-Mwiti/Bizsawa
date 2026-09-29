// React Native (Hermes) has no `crypto.getRandomValues` natively.
// App IDs now use expo-crypto's randomUUID() (no global crypto needed),
// but this polyfill is kept as defensive coverage for any remaining
// transitive consumers of global crypto.getRandomValues.
import 'react-native-get-random-values'
