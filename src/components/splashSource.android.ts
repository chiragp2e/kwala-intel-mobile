// On Android the release build did not resolve these as bundled resources (the
// image came back with an empty uri), so they are read straight from the APK's
// assets folder (android/app/src/main/assets), which Fresco loads as `asset:`.
export const splashGif = { uri: 'asset:/splash.gif' };
export const splashStill = { uri: 'asset:/splash-still.png' };
