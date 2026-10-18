import { vi } from "vitest"

// Pin the wall clock so date/time-dependent assertions are deterministic in
// every timezone the suite runs under. The (timezone-less) string is interpreted
// in the TZ the process was started with, so this lands at local noon on the
// same calendar day regardless of the zone.
vi.setSystemTime(new Date("2026-10-18T12:00:00"))