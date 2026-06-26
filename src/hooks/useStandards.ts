import { useState, useEffect } from 'react';
import type { Standard } from '../types';
import { loadStandards } from '../lib/dataLoader';

export interface UseStandardsResult {
  readonly standards: ReadonlyArray<Standard>;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export function useStandards(): UseStandardsResult {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStandards()
      .then((data) => {
        setStandards(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      });
  }, []);

  return { standards, isLoading, error };
}
