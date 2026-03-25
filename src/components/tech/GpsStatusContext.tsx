"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type GpsStatus = {
  isTracking: boolean;
  lastPingAt: string | null;
  accuracy: number | null;
  error: string | null;
  gpsPermission: "granted" | "denied" | "prompt" | "unknown";
};

type GpsStatusContextType = GpsStatus & {
  update: (patch: Partial<GpsStatus>) => void;
};

const defaultStatus: GpsStatus = {
  isTracking: false,
  lastPingAt: null,
  accuracy: null,
  error: null,
  gpsPermission: "unknown",
};

const GpsStatusContext = createContext<GpsStatusContextType>({
  ...defaultStatus,
  update: () => {},
});

export function GpsStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GpsStatus>(defaultStatus);

  const update = useCallback((patch: Partial<GpsStatus>) => {
    setStatus((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <GpsStatusContext.Provider value={{ ...status, update }}>
      {children}
    </GpsStatusContext.Provider>
  );
}

export function useGpsStatus() {
  return useContext(GpsStatusContext);
}
