import { loadConfig } from '../src/sim/load';
import { createState, tick } from '../src/sim/model';
const cfg = loadConfig('scenario-jaar1.json');
const s0 = createState(cfg, 1);
const s = tick(s0, [], cfg);
const r = s.history[0];
console.log('persona', ['bewoner','ondernemer','bezoeker','fietser','stad','wethouder','blij'].map(k => k + ' ' + (r as any)[k].toFixed(0)).join(' | '));
console.log('rev', (r.revenue/1e6).toFixed(2), 'costs', (r.costs/1e6).toFixed(2), 'opex', (r.opex/1e6).toFixed(2), 'staff', (r.staffCost/1e6).toFixed(2), 'oh', (r.overhead/1e6).toFixed(2), 'fonds', (s.fonds/1e6).toFixed(1), 'bikeShort', r.bikeShort.toFixed(2), 'netheid', r.netheid.toFixed(0), 'klant', r.klantBacklog.toFixed(0), 'staff', JSON.stringify(s.staff));
for (const w of Object.values(s.wijken)) console.log(w.id.padEnd(9), 'bez', w.m.bez.toFixed(2), 'zoek', w.m.search.toFixed(1), 'rev', (w.m.revenue/1e6).toFixed(2), 'nal', w.m.naleving.toFixed(2), w.paid ? w.tariff : 'gratis');
