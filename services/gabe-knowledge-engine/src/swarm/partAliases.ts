export const PART_ALIASES: Record<string, string[]> = {
  thermopile: ['thermopile', 'pilot generator', 'millivolt generator'],
  thermocouple: ['thermocouple', 'pilot sensor'],
  control_module: ['control module', 'module board', 'receiver module'],
  gas_valve: ['gas valve', 'valve assembly'],
  igniter: ['igniter', 'spark igniter', 'electrode'],
};

export function expandPartTerms(question: string) {
  const q = question.toLowerCase();
  const out = new Set<string>();
  Object.entries(PART_ALIASES).forEach(([k, aliases]) => {
    if (aliases.some((a) => q.includes(a))) {
      out.add(k);
      aliases.forEach((a) => out.add(a));
    }
  });
  return Array.from(out);
}
