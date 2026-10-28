import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  /** `sessionId` opens an existing chat; `fresh` (a changing number) starts a new one. */
  Chat: { sessionId?: string; fresh?: number } | undefined;
  History: undefined;
  SignIn: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
