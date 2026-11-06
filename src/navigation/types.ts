import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  /**
   * `sessionId` opens an existing chat; `fresh` (a changing number) starts a new one;
   * `send` is a question a guest asked before signing in, sent as soon as they land back.
   */
  Chat: { sessionId?: string; fresh?: number; send?: string } | undefined;
  Pricing: undefined;
  Billing: undefined;
  Profile: undefined;
  About: undefined;
  Notifications: undefined;
  /** `prompt`: the question that made a guest sign in; it is answered straight after. */
  SignIn: { prompt?: string } | undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
