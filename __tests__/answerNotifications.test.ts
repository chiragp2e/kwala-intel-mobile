import { answerReadyText, askForAnswerNotifications, notifyAnswerReady } from '../src/lib/answerNotifications';

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
// jest.setup.js mocks this module for the other suites; here it is the real one.
jest.unmock('../src/lib/answerNotifications');

describe('answer-ready notification', () => {
  it('names the question, on one line and shortened', () => {
    expect(answerReadyText('  What moved\n in crypto   today? ')).toEqual({ title: 'Your answer is ready', body: 'What moved in crypto today?' });
    const long = `Compare ${'bitcoin and ether '.repeat(10)}`;
    const { body } = answerReadyText(long);
    expect(body.length).toBeLessThanOrEqual(90);
    expect(body.endsWith('…')).toBe(true);
  });

  it('does nothing, and asks nothing, without the native module (tests, older binaries)', async () => {
    await expect(askForAnswerNotifications('android', 34)).resolves.toBeUndefined();
    expect(() => notifyAnswerReady('q')).not.toThrow();
  });
});
