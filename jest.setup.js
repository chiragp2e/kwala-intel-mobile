let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockCounter}` }));
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
    getItemAsync: async k => (store.has(k) ? store.get(k) : null),
    setItemAsync: async (k, v) => void store.set(k, v),
    deleteItemAsync: async k => void store.delete(k),
  };
});
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: () => () => {} },
}));
jest.mock('./src/lib/backgroundTask', () => ({ keepAliveInBackground: () => () => {} }));
jest.mock('./src/lib/answerNotifications', () => ({ askForAnswerNotifications: jest.fn(async () => {}), notifyAnswerReady: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-audio', () => ({
  AudioQuality: { MEDIUM: 64 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => ({
    uri: 'file:///clip.m4a',
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    getStatus: () => ({ metering: -20, durationMillis: 0 }),
  }),
}));
