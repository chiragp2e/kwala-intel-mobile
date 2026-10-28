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
