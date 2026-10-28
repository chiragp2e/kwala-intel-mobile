module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void somePromise()` is how this codebase marks a deliberately unawaited call.
    'no-void': 'off',
  },
  overrides: [{ files: ['jest.setup.js', '__tests__/**'], env: { jest: true } }],
};
