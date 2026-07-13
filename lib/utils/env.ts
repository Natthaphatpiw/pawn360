// Shared environment-variable helpers.
//
// Consolidates logic that was previously duplicated across the estimate /
// analyze-condition routes and the shared Anthropic client (key collection) and
// across the SerpAPI / manual-estimate feature flags (boolean parsing).

// Trims a list of (possibly undefined) env values and drops the empty ones.
// Used to build API-key rotation arrays from ENV_KEY(_2/_3/_4) groups.
export const collectEnvKeys = (values: Array<string | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

// Parses a truthy env flag: 'true' | '1' | 'yes' | 'on' (case/whitespace-insensitive),
// everything else (including unset) is false. Mirrors the prior inline parsers exactly.
export const parseBoolEnv = (value: string | undefined): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};
