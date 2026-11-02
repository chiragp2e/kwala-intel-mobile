import { createContext, useContext } from 'react';

/** What the screen hosting the blocks lets them do. */
export interface BlockHost {
  /** Send text as the user's next message (follow-up chips). Absent: the chips render disabled. */
  onPrompt?: (text: string) => void;
}

export const BlockHostContext = createContext<BlockHost>({});
export const useBlockHost = () => useContext(BlockHostContext);
