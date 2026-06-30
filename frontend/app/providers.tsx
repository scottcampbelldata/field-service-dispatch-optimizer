"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_PARAMS,
  OptimizeParams,
  OptimizeResult,
  Workload,
  fetchWorkload,
  optimize,
} from "@/lib/api";

interface Ctx {
  workload: Workload | null;
  workloadError: string | null;
  params: OptimizeParams;
  setParams: (p: Partial<OptimizeParams>) => void;
  result: OptimizeResult | null;
  loading: boolean;
  error: string | null;
  runOptimize: () => Promise<OptimizeResult | null>;
}

const DispatchContext = createContext<Ctx | null>(null);

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [workloadError, setWorkloadError] = useState<string | null>(null);
  const [params, setParamsState] = useState<OptimizeParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkload()
      .then(setWorkload)
      .catch((e) => setWorkloadError(String(e)));
  }, []);

  const setParams = useCallback((p: Partial<OptimizeParams>) => {
    setParamsState((prev) => ({ ...prev, ...p }));
  }, []);

  const runOptimize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await optimize(params);
      setResult(r);
      return r;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [params]);

  return (
    <DispatchContext.Provider
      value={{ workload, workloadError, params, setParams, result, loading, error, runOptimize }}
    >
      {children}
    </DispatchContext.Provider>
  );
}

export function useDispatch(): Ctx {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatch must be used within DispatchProvider");
  return ctx;
}
