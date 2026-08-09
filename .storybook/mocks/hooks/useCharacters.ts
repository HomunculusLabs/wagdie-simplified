import type { useCharacters as useCharactersHook } from '@/hooks/useCharacters';
import { useHookMock } from '../hook-mocks/HookMocksProvider';

type UseCharactersResult = ReturnType<typeof useCharactersHook>;

export function useCharacters(..._args: Parameters<typeof useCharactersHook>): UseCharactersResult {
  return (
    useHookMock<UseCharactersResult>('useCharacters') ?? {
      characters: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
      hasMore: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: async () => ({}) as Awaited<ReturnType<UseCharactersResult['refetch']>>,
    }
  );
}
