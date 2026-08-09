import React, { createContext, useContext, type ReactNode } from 'react';

import type { useSearing } from '@/hooks/useSearing';
import type { useSearingConcords } from '@/hooks/useSearingConcords';
import type { useSpread } from '@/hooks/useSpread';
import type { useCure } from '@/hooks/useCure';
import type { useCorpseBurning } from '@/hooks/useCorpseBurning';
import type { useTokenBalances } from '@/hooks/useTokenBalances';
import type { useStaking } from '@/hooks/useStaking';
import type { useAICharacter } from '@/hooks/useAICharacter';
import type { useCharacters } from '@/hooks/useCharacters';

export type HookMocks = {
  useSearing?: ReturnType<typeof useSearing>;
  useSearingConcords?: ReturnType<typeof useSearingConcords>;
  useSpread?: ReturnType<typeof useSpread>;
  useCure?: ReturnType<typeof useCure>;
  useCorpseBurning?: ReturnType<typeof useCorpseBurning>;
  useTokenBalances?: ReturnType<typeof useTokenBalances>;
  useStaking?: ReturnType<typeof useStaking>;
  useAICharacter?: ReturnType<typeof useAICharacter>;
  useCharacters?: ReturnType<typeof useCharacters>;
};

interface HookMocksProviderProps {
  mocks?: HookMocks;
  children: ReactNode;
}

const HookMocksContext = createContext<HookMocks>({});

export function HookMocksProvider({ mocks, children }: HookMocksProviderProps): JSX.Element {
  return <HookMocksContext.Provider value={mocks ?? {}}>{children}</HookMocksContext.Provider>;
}

export function useHookMock<T>(key: keyof HookMocks): T | undefined {
  const mocks = useContext(HookMocksContext);
  return mocks[key] as T | undefined;
}