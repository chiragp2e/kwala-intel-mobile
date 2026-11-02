/**
 * @format
 */

// Installs Expo's runtime polyfills (TextDecoder, URL, fetch streaming) and the
// native modules before the app renders.
import './src/polyfills';
import 'expo';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
