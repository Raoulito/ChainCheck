import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lookupAddress, enrichPrices } from './client';
import type { LookupResponse, PriceEnrichRequest } from '../types/api';
import { timestampToDateStr } from '../utils/formatters';

export function useLookup(chain: string | null, address: string | null, page: number = 1) {
  return useQuery({
    queryKey: ['lookup', chain, address, page],
    queryFn: () => lookupAddress(chain!, address!, page),
    enabled: !!chain && !!address,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePriceEnrichment(chain: string | null, address: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PriceEnrichRequest) => enrichPrices(body),
    onSuccess: (data) => {
      queryClient.setQueriesData<LookupResponse>(
        { queryKey: ['lookup', chain, address] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            transactions: old.transactions.map((tx) => {
              const tokenId = tx.token.toLowerCase() === 'btc' ? 'bitcoin' : 'ethereum';
              const dateStr = timestampToDateStr(tx.timestamp);
              const key = `${tokenId}:${dateStr}`;
              return {
                ...tx,
                value_usd_at_time: data.prices[key] ?? tx.value_usd_at_time,
              };
            }),
          };
        }
      );
    },
  });
}
