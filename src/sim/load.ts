import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Config } from './types';

/** Node-only helper: merges data/config.json with a scenario file under `config.scenario`. */
export function loadConfig(scenario = 'scenario-week1.json'): Config {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
  const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  cfg.scenario = JSON.parse(readFileSync(join(dir, scenario), 'utf8'));
  return cfg;
}
