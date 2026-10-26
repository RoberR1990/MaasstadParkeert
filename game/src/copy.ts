// All player-facing Dutch text that depends on the simulation (explanations, reactions, lessons, headlines, advice).
import type { Cause } from '@sim/round';
import type { TeamId } from '@sim/types';
import { TEAMS } from '@sim/types';
import { tick } from '@sim/model';
import { teamLevel } from '@sim/round';
import { WIJK_BY_ID, type WijkId } from './wijken';
import { GOAL, TC, cfg, type Ending, type PlanItem, type QuarterResult, type Session, type TeamView } from './session';

export const fmtMin = (m: number) => `${m >= 19.5 ? '20+' : m.toFixed(m < 10 ? 1 : 0).replace('.', ',')} min`;
const minTxt = (m: number) => (m >= 19.5 ? '20+' : String(Math.round(m)));
/** Money in M€: always two decimals (a 15 k€ machine must be visible). */
export const fmtM = (v: number, sign = false) => {
  const s = (Math.abs(v) / 1e6).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s} M€`;
};
/** Small amounts in k€, big ones in M€ (for prices and deltas). */
export const fmtPrice = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(a / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} M€`;
  return `${Math.round(a / 1e3).toLocaleString('nl-NL')} k€`;
};
export const fmtDelta = (v: number) => `${v < 0 ? '−' : '+'}${fmtPrice(v)}`;

export const PERSONA_NL: Record<string, string> = { bewoner: 'Bewoners', ondernemer: 'Ondernemers', bezoeker: 'Bezoekers', fietser: 'Fietsers', stad: 'Stad', wethouder: 'Wethouder' };
export const wijkName = (id: WijkId) => WIJK_BY_ID[id].short;

export interface CauseLine { text: string; good: boolean; delta: number }
/** One plain-Dutch line per cause: what moved, and (when we can tell) why. */
export function causeLines(res: QuarterResult, session: Session): CauseLine[] {
  const items = res.items, news = session.news.bind(session);
  void news;
  const has = (kind: string, wijk?: WijkId) => items.some((i) => i.kind === kind && (!wijk || i.wijk === wijk));
  const out: CauseLine[] = [];
  for (const c of res.causes) {
    const good = c.delta > 0, d = Math.abs(c.delta);
    const pts = d < 0.5 ? '' : ` (${good ? '+' : '−'}${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')})`;
    let t = '';
    switch (c.kind) {
      case 'zoektijd': {
        const w = c.wijk as WijkId | undefined, n = w ? wijkName(w) : 'de stad';
        const range = c.from != null && c.to != null ? ` van ${minTxt(c.from)} naar ${minTxt(c.to)} min` : '';
        let why = '';
        if (w && has('garage', w)) why = ' door je nieuwe garage';
        else if (w && has('scanauto', w)) why = ' door de scanauto';
        else if (w && (has('intro', w) || has('tariff', w))) why = good ? ' door het nieuwe tarief' : ' door het nieuwe tarief';
        else if (w === 'kuipwijk' && !good && (has('tariff', 'centrum') || has('intro', 'centrum'))) why = ': auto’s wijken uit naar gratis parkeren';
        else if (w === 'kopbrug' && !good && session.results.length >= 0 && res.q === 1) why = ' door de nieuwe torens';
        else if (w === 'centrum' && !good && res.q === GOAL.marathon.quarter) why = ' door de Marathon';
        else if (!good) why = ': het wordt drukker';
        t = good ? `Zoektijd ${n} korter${range}${why}` : `Zoektijd ${n} langer${range}${why}`;
        break;
      }
      case 'fiets': t = good ? `Meer fietsplekken: tekort van ${Math.round(c.from ?? 0)}% naar ${Math.round(c.to ?? 0)}%${items.some((i) => i.kind === 'stalling') ? ' door je stalling' : ''}` : `Fietsers vinden minder plek: tekort nu ${Math.round(c.to ?? 0)}%`; break;
      case 'netheid': t = good ? 'De stad is schoner: er zijn genoeg schoonmakers' : 'De stad wordt viezer: te weinig schoonmakers'; break;
      case 'tarief': t = c.wijk ? (good ? `Het tarief in ${wijkName(c.wijk as WijkId)} valt goed bij ondernemers en bezoekers` : `Ondernemers en bezoekers vinden het tarief in ${wijkName(c.wijk as WijkId)} te duur`) : (good ? 'Het tarief valt goed' : 'Het tarief is te duur voor ondernemers en bezoekers'); break;
      case 'storing': t = good ? 'Minder storingen aan betaalautomaten' : 'Betaalautomaten vallen vaker uit: te weinig monteurs'; break;
      case 'dicht': t = good ? 'Minder garages dicht of achter met onderhoud' : 'Een garage is (deels) dicht door achterstallig onderhoud'; break;
      case 'klachten': t = good ? 'Klachten bij Klantcontact nemen af' : 'Klachten stapelen op bij Klantcontact'; break;
      case 'fonds': t = good ? 'Het fonds is gezond: de wethouder is tevreden' : `Het fonds slinkt (${fmtM(c.to ?? 0)}): de wethouder kijkt mee`; break;
      case 'invoering': t = good ? 'Het wennen aan betaald parkeren is voorbij' : 'Het wennen aan betaald parkeren kost even goodwill'; break;
    }
    out.push({ text: t + pts, good, delta: c.delta });
  }
  return out;
}

// ---------------------------------------------------------------- reactions of Rotterdammerts
interface Voice { who: string; up: string[]; down: string[]; flat: string[] }
const VOICES: Record<string, Voice> = {
  bewoner: { who: 'Joke, bewoner', up: ['Eindelijk weer een plekje bij de deur!', 'Ik hoef niet meer drie keer om het blok.'], down: ['Ik rijd me suf voor een plek bij mijn eigen voordeur.', 'Elke avond rondjes. Wie regelt dit?'], flat: ['Het is wat het is. Ik zoek nog steeds.'] },
  ondernemer: { who: 'Mo, ondernemer', up: ['Mijn klanten kunnen weer parkeren. Dat merk ik aan de kassa.', 'Eindelijk weer wat volk in de zaak.'], down: ['Klanten haken af: geen plek, geen omzet.', 'Te duur of te vol, ze rijden door naar de Kringloop.'], flat: ['Ik wacht nog op verbetering, hoor.'] },
  bezoeker: { who: 'Dennis, bezoeker', up: ['Staan, betalen, klaar. Zo moet het.', 'Ik was zo binnen. Lekker.'], down: ['Twintig minuten rondjes en dan nog een boete ook.', 'Ik kom niet meer met de auto naar de stad.'], flat: ['Gaat wel. Kan beter.'] },
  fietser: { who: 'Sanne, fietser', up: ['Eindelijk een droge, veilige plek voor mijn fiets!', 'Mijn fiets staat nu niet meer tegen een lantaarnpaal.'], down: ['Mijn fiets staat weer tegen een lantaarnpaal. Voor de derde keer deze maand.', 'Geen plek voor mijn fiets, dus ik neem de tram.'], flat: ['Fietsplekken? Nog steeds te weinig.'] },
  stad: { who: 'Gerrit, buurtbewoner', up: ['Het is hier een stuk schoner en rustiger.', 'Zo mag mijn straat wel blijven.'], down: ['Het ligt hier vol troep en auto’s.', 'Zo wordt het geen stad om trots op te zijn.'], flat: ['Merkwaardig weinig veranderd.'] },
  wethouder: { who: 'De wethouder', up: ['Mooi dat de begroting klopt en de klachten dalen.', 'Dit kan ik in de raad uitleggen.'], down: ['Raadsvragen over het parkeerfonds. Dit moet beter.', 'De krant belt al. Wat is hier aan de hand?'], flat: ['Ik houd het in de gaten.'] },
};
export interface Reaction { who: string; text: string; persona: string; delta: number }
/** Two Rotterdammers react: the ones whose mood moved the most (preferably one up, one down). */
export function reactions(res: QuarterResult): Reaction[] {
  const ds = Object.keys(res.personaNew).map((k) => ({ k, d: res.personaNew[k] - res.personaOld[k] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const picked = [ds[0]];
  const opposite = ds.find((x) => x !== ds[0] && Math.sign(x.d) !== Math.sign(ds[0].d) && Math.abs(x.d) > 1);
  picked.push(opposite ?? ds[1]);
  return picked.map((p, i) => {
    const v = VOICES[p.k], set = p.d > 1 ? v.up : p.d < -1 ? v.down : v.flat;
    return { who: v.who, text: set[(res.q + i) % set.length], persona: p.k, delta: p.d };
  });
}

// ---------------------------------------------------------------- the Rotterdammer's one-liner must match the score
export const SAY = {
  happy: ['Lekker hoor, meteen een plekkie!', 'Staat-ie! Zo doen we dat in Rotterdam.', 'Geen gezeur, gewoon parkeren. Heerlijk.'],
  good: ['Gaat prima, hoor. Kan niet klagen.', 'Even doorrijden, dan heb ik ’m wel.', 'Mooi, mooi. Zo houden we het.'],
  mid: ['Nou, effe zoeken…', 'Het schiet op, maar het is nog niet af.', 'Dit wordt nog even rondjes draaien.'],
  bad: ['Ik draai al twintig minuten rondjes, hoor!', 'Weer bezet. Echt waar?', 'Doe mij maar een plekkie, graag!'],
  mad: ['Dit meen je toch niet?!', 'Ik sta zo in de krant, wacht maar!', 'Ik zoek me suf. Wie regelt dit?!'],
};
export const moodWord = (h: number) => (h > 78 ? 'Dolblij' : h > 62 ? 'Tevreden' : h > 46 ? 'Twijfelend' : h > 30 ? 'Chagrijnig' : 'Woedend');
export const moodSet = (h: number) => (h > 76 ? SAY.happy : h > 62 ? SAY.good : h > 46 ? SAY.mid : h > 30 ? SAY.bad : SAY.mad);

// ---------------------------------------------------------------- teams (copy)
export interface TeamInfo { id: TeamId; name: string; short: string; person: string; does: string; drivers: string }
export const TEAM_INFO: Record<TeamId, TeamInfo> = {
  handhaving: { id: 'handhaving', name: 'Handhaving', short: 'Handhaving', person: 'Fatima', does: 'Rijdt met de scanauto, controleert en schrijft bonnen.', drivers: 'Elke scanauto vraagt een handhaver erbij. Evenementen vragen extra uren.' },
  backoffice: { id: 'backoffice', name: 'Backoffice & Bezwaar', short: 'Backoffice', person: 'Daan', does: 'Beoordeelt scans, stuurt naheffingen en behandelt bezwaren.', drivers: 'Meer scans geeft meer naheffingen. Meer naheffingen geeft meer bezwaren.' },
  techniek: { id: 'techniek', name: 'Techniek', short: 'Techniek', person: 'Kevin', does: 'Repareert betaalautomaten, slagbomen en liften.', drivers: 'Garages en betaalautomaten. Storingen kosten extra tijd.' },
  schoonmaak: { id: 'schoonmaak', name: 'Schoonmaak & Garagebeheer', short: 'Schoonmaak', person: 'Mehmet', does: 'Houdt garages en stallingen schoon en veilig.', drivers: 'Elke garage en elke fietsenstalling die je bouwt.' },
  klantcontact: { id: 'klantcontact', name: 'Klantcontact', short: 'Klantcontact', person: 'Priya', does: 'Beantwoordt telefoon, mail en chat van Rotterdammers.', drivers: 'Elke verandering die burgers raakt: een nieuw tarief, een bon, een storing.' },
};
const PART_NL: Record<string, string> = {
  scanautos: 'scanauto’s', scans: 'scans beoordelen', bezwaren: 'bezwaren', garages: 'garages', automaten: 'betaalautomaten', storingen: 'storingen', stallingen: 'stallingen', pr: 'P+R',
  klachten: 'vragen en klachten', invoering: 'wennen aan betaald parkeren', dilemma: 'verzoek van de ondernemer',
  moment_handhaving: 'extra handhaving Marathon', moment_evenementtarief: 'vragen over evenemententarief', moment_pendel: 'pendeldienst', moment_brief: 'reacties op de bewonersbrief',
};
const partName = (k: string) => PART_NL[k] ?? (k.startsWith('beleid_') ? 'tariefwijziging' : k);
export const fte1 = (v: number) => v.toFixed(1).replace('.', ',');
export const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v))}%`;
/** Tooltip text for a team card: what the team does and what its work is made of right now. */
export function teamTip(v: TeamView): string {
  const info = TEAM_INFO[v.id];
  const parts = Object.entries(v.parts).filter(([, x]) => x > 0.04).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${partName(k)} ${fte1(x)}`).join(' · ');
  const back = v.backlog > 0.2 ? ` Achterstand: ${fte1(v.backlog)} FTE werk blijft liggen.` : '';
  return `${info.name}|${info.does} Werk nu: ${parts || 'nog weinig'} (samen ${fte1(v.demand)} FTE). Er werken ${fte1(v.fte)} FTE.${back} ${info.drivers}`;
}
export const levelWord = (l: 'groen' | 'oranje' | 'rood') => (l === 'groen' ? 'Rustig' : l === 'oranje' ? 'Druk' : 'Overbelast');

// ---------------------------------------------------------------- occupancy wording (never "125% vol")
export function bezWord(bez: number): { short: string; long: string; sev: 'ok' | 'mid' | 'bad' } {
  if (bez > 1.005) { const n = Math.max(2, Math.round(bez / (bez - 1))); return { short: `1 op ${n} geen plek`, long: `Overvol: 1 op ${n} auto’s vindt geen plek`, sev: 'bad' }; }
  if (bez >= 0.93) return { short: 'bijna vol', long: `Bijna vol: ${Math.round(bez * 100)}% van de plekken is bezet`, sev: 'mid' };
  if (bez >= 0.75) return { short: 'druk', long: `Druk: ${Math.round(bez * 100)}% van de plekken is bezet`, sev: 'mid' };
  return { short: 'rustig', long: `Rustig: ${Math.round(bez * 100)}% van de plekken is bezet`, sev: 'ok' };
}

// ---------------------------------------------------------------- chain reaction (KETENS.md K1-K8) for the afrekening
export interface ChainStep { team: TeamId; line: string; delta: number; level: 'groen' | 'oranje' | 'rood'; soon: boolean }
export interface Chain { id: string; title: string; steps: ChainStep[] }
const fmtWork = (d: number, fte: number) => { const n = Math.round((d / Math.max(0.5, fte)) * 100); return Math.abs(n) >= 3 ? ` (werkdruk ${n > 0 ? '+' : '−'}${Math.abs(n)}%)` : ''; };
interface ChainDef { id: string; title: string; gate?: (items: PlanItem[], res: QuarterResult) => boolean; steps: { team: TeamId; keys: (k: string) => boolean; up: string; flat: string }[]; plan?: (items: PlanItem[], res: QuarterResult) => number }
const isBeleid = (k: string) => k.startsWith('beleid_');
const CHAINS: ChainDef[] = [
  { id: 'K1', title: 'Extra scanauto', gate: (it) => it.some((i) => i.kind === 'scanauto'), plan: (it) => (it.some((i) => i.kind === 'scanauto') ? 0.6 : 0), steps: [
    { team: 'handhaving', keys: (k) => k === 'scanautos', up: 'De scanauto rijdt rondes: meer kentekens gescand.', flat: 'De scanauto rijdt rondes.' },
    { team: 'backoffice', keys: (k) => k === 'scans' || k === 'bezwaren', up: 'Scans moeten worden beoordeeld, en een deel wordt bezwaar.', flat: 'Scans en bezwaren worden afgehandeld.' },
    { team: 'klantcontact', keys: (k) => k === 'scanautos' || k === 'klachten', up: 'Rotterdammers bellen over hun bon.', flat: 'Vragen over bonnen.' }] },
  { id: 'K2', title: 'Storing aan betaalautomaten', steps: [
    { team: 'techniek', keys: (k) => k === 'storingen' || k === 'automaten', up: 'Automaten vallen uit: monteurs rukken uit.', flat: 'Monteurs onderhouden de automaten.' },
    { team: 'klantcontact', keys: (k) => k === 'klachten', up: 'Rotterdammers kunnen niet betalen en bellen.', flat: 'Vragen over betalen.' },
    { team: 'backoffice', keys: (k) => k === 'bezwaren', up: 'Bonnen voor een defecte automaat worden vernietigd.', flat: 'Bezwaren worden afgehandeld.' }] },
  { id: 'K3', title: 'Garage bouwen', gate: (it) => it.some((i) => i.kind === 'garage'), plan: (it) => (it.some((i) => i.kind === 'garage') ? 0.5 : 0), steps: [
    { team: 'techniek', keys: (k) => k === 'garages', up: 'Slagbomen, liften en verlichting moeten onderhouden worden.', flat: 'Onderhoud van de garage.' },
    { team: 'schoonmaak', keys: (k) => k === 'garages' || k === 'stallingen', up: 'Een garage moet elke dag schoon en veilig zijn.', flat: 'Schoonmaak en toezicht.' }] },
  { id: 'K4', title: 'Betaald parkeren invoeren', gate: (it) => it.some((i) => i.kind === 'intro'), plan: (it) => (it.some((i) => i.kind === 'intro') ? 1 : 0), steps: [
    { team: 'klantcontact', keys: (k) => isBeleid(k) || k === 'invoering', up: 'Bewoners bellen: vergunningen, bezoekers, borden.', flat: 'Vragen over het nieuwe beleid.' },
    { team: 'backoffice', keys: (k) => isBeleid(k), up: 'Vergunningaanvragen en eerste bezwaren stapelen op.', flat: 'Aanvragen en bezwaren.' },
    { team: 'handhaving', keys: (k) => k === 'scanautos', up: 'Na het wennen begint de handhaving.', flat: 'Handhaving controleert.' }] },
  { id: 'K5', title: 'Nieuwe woontorens', gate: (_it, res) => res.messages.length > 0 && res.q === 1, steps: [
    { team: 'klantcontact', keys: (k) => k === 'klachten' || k === 'invoering', up: 'Nieuwe bewoners vragen om een plek.', flat: 'Vragen van nieuwe bewoners.' },
    { team: 'handhaving', keys: (k) => k === 'scanautos', up: 'Meer auto’s, meer foutparkeren.', flat: 'Handhaving controleert.' }] },
  { id: 'K6', title: 'Marathon Rotterdam', gate: (_it, res) => res.q === GOAL.marathon.quarter, plan: (it, res) => (res.q === GOAL.marathon.quarter ? 1.2 : 0), steps: [
    { team: 'handhaving', keys: (k) => k === 'scanautos' || k === 'moment_handhaving', up: 'Straten zijn dicht: handhaving houdt de omgeving vrij.', flat: 'Handhaving rond de route.' },
    { team: 'klantcontact', keys: (k) => k.startsWith('moment_') || k === 'klachten', up: 'Bewoners en bezoekers bellen over de afsluiting.', flat: 'Vragen over de afsluiting.' },
    { team: 'schoonmaak', keys: (k) => k === 'garages' || k === 'stallingen', up: 'Na afloop moeten de garages schoon.', flat: 'Schoonmaak na afloop.' }] },
  { id: 'K7', title: 'Te weinig schoonmaak', steps: [
    { team: 'schoonmaak', keys: () => true, up: 'Er blijft werk liggen: vuil bouwt zich op.', flat: 'Schoonmaak loopt achter.' },
    { team: 'klantcontact', keys: (k) => k === 'klachten', up: 'Meldingen over vuil en onveilig voelen stapelen op.', flat: 'Meldingen.' }] },
  { id: 'K8', title: 'Tarief veranderd', gate: (it) => it.some((i) => i.kind === 'tariff'), plan: (it) => (it.some((i) => i.kind === 'tariff') ? 0.9 : 0), steps: [
    { team: 'klantcontact', keys: isBeleid, up: 'Ondernemers en bewoners bellen over het nieuwe tarief.', flat: 'Vragen over het tarief.' },
    { team: 'backoffice', keys: isBeleid, up: 'Meer bezwaren tegen bonnen en tarief.', flat: 'Bezwaren.' }] },
];
const sumKeys = (parts: Record<string, number> | undefined, f: (k: string) => boolean) => Object.entries(parts ?? {}).reduce((a, [k, v]) => (f(k) ? a + v : a), 0);

/** The chain that moved the most this quarter (by extra work for the teams in it), or null when nothing rolled through the teams. */
export function pickChain(res: QuarterResult): Chain | null {
  if (!res.next.teams || !res.old.teams) return null;
  const after = tick(res.next, [], cfg), grow = res.messages.length > 0 && res.q === 1;
  let best: { def: ChainDef; score: number } | null = null;
  for (const def of CHAINS) {
    if (def.gate && !def.gate(res.items, res)) continue;
    let score = def.plan ? def.plan(res.items, res) : 0;
    if (def.id === 'K5' && grow) score += 0.5;
    if (def.id === 'K4' && !res.items.some((i) => i.kind === 'intro')) score += 0; // peaks without introduction count for K8
    if (def.id === 'K7') score += Math.max(0, res.next.teams.units.schoonmaak.achterstand);
    for (const s of def.steps) {
      if (def.id === 'K7') break;
      const a = sumKeys(res.old.teams.units[s.team].parts, s.keys), b = sumKeys(res.next.teams.units[s.team].parts, s.keys), c = sumKeys(after.teams!.units[s.team].parts, s.keys);
      score += Math.max(0, b - a, c - b);
    }
    if (def.id === 'K4' && res.items.some((i) => i.kind === 'tariff') && !res.items.some((i) => i.kind === 'intro')) score *= 0.2;
    if (!best || score > best.score) best = { def, score };
  }
  if (!best || best.score < 0.2) return null;
  const steps: ChainStep[] = best.def.steps.map((s) => {
    const a = sumKeys(res.old.teams!.units[s.team].parts, s.keys), b = sumKeys(res.next.teams!.units[s.team].parts, s.keys), c = sumKeys(after.teams!.units[s.team].parts, s.keys);
    const delta = Math.abs(b - a) >= Math.abs(c - b) ? b - a : c - b;
    const lvNow = teamLevel(res.next.teams!.units[s.team].load, cfg), lvSoon = teamLevel(after.teams!.units[s.team].load, cfg);
    const rank = { groen: 0, oranje: 1, rood: 2 } as const;
    const level = rank[lvSoon] > rank[lvNow] ? lvSoon : lvNow;
    const word = level === 'rood' ? ' Het team raakt overbelast.' : level === 'oranje' ? ' Het wordt druk.' : '';
    return { team: s.team, delta, level, soon: rank[lvSoon] > rank[lvNow], line: `${delta > 0.04 ? s.up : s.flat}${fmtWork(delta, res.next.teams!.units[s.team].fte)}${word}` };
  });
  return { id: best.def.id, title: best.def.title, steps };
}

// ---------------------------------------------------------------- Sap: one dry piece of advice per quarter, only when there is a risk
const q4 = (q: number) => `Q${q}`;
export function sapAdvice(session: Session, res: QuarterResult): string | null {
  const s = session.state, nextQ = s.quarter + 1; // quarter number the player is about to plan (1-based)
  const views = session.teamViews(s);
  const red = TEAMS.filter((t) => views[t].level === 'rood');
  const after = s.teams ? tick(s, [], cfg) : null;
  const soon = after ? TEAMS.filter((t) => teamLevel(after.teams!.units[t].load, cfg) !== 'groen' && views[t].level !== 'rood') : [];
  const built = (k: string) => res.items.filter((i) => i.kind === k).length;
  if (red.length) {
    const t = red[0];
    const lines: Record<TeamId, string> = {
      handhaving: 'Scanauto’s zonder genoeg handhavers? Dat is een dure parkeerplek, jongen. Neem iemand aan.',
      backoffice: 'Scans die blijven liggen worden bezwaren, en bezwaren die te laat komen worden raadsvragen. Backoffice heeft hulp nodig.',
      techniek: 'Kapotte automaten repareren zichzelf niet. Een monteur kost minder dan de derving.',
      schoonmaak: built('garage') >= 2 ? `Twee garages en geen schoonmaker? Dat ruik je in ${q4(Math.min(4, nextQ + 1))}, jongen.` : 'Een garage zonder schoonmaker wordt vanzelf een probleem. Dat ruik je, jongen.',
      klantcontact: 'De telefoon staat roodgloeiend. Wie het beleid verandert, moet ook de telefoon bemensen.',
    };
    return `${TEAM_INFO[t].name} staat in het rood. ${lines[t]} Aannemen duurt een kwartaal.`;
  }
  if (soon.length) return `${TEAM_INFO[soon[0]].name} loopt volgend kwartaal vol. Aannemen duurt een kwartaal, dus als je nu niets doet, staat het straks in het rood.`;
  if (s.fonds < 2e6) return `Je fonds is ${fmtM(s.fonds)}. Het beheer loopt elk kwartaal door, ook als je niets bouwt. Hou dat in de gaten.`;
  const over = Object.values(s.wijken).filter((w) => w.m.bez > 1.1).sort((a, b) => b.m.bez - a.m.bez)[0];
  if (over) return `${wijkName(over.id as WijkId)} is overvol: ${bezWord(over.m.bez).long.toLowerCase().replace('overvol: ', '')}. Dat merken bewoners en ondernemers meteen.`;
  if (nextQ === GOAL.marathon.announceQuarter + 1) return 'De Marathon komt eraan. Wie dan extra handhaving wil inzetten, heeft de mensen nu nodig: aannemen duurt een kwartaal.';
  return null;
}

// ---------------------------------------------------------------- dilemma + Moment copy
export const DILEMMA = {
  title: 'Een ondernemer vraagt gratis parkeren',
  text: 'Een winkelier in het Centrum verbouwt een paar maanden. Hij vraagt of klanten rond zijn straat gratis mogen parkeren. “Anders blijft mijn winkel leeg.”',
  options: {
    ja: { label: 'Ja, gratis parkeren rond de winkelstraat', pros: 'Ondernemers zijn blij en er komen meer bezoekers.', cons: 'Je mist straatinkomsten in het Centrum en Klantcontact krijgt vragen van andere straten.', after: 'Je liet het gratis parkeren toe.' },
    nee: { label: 'Nee, de regels gelden voor iedereen', pros: 'Het fonds blijft gezond en niemand krijgt een uitzondering.', cons: 'Ondernemers voelen zich niet gehoord en Backoffice krijgt bezwaren.', after: 'Je hield vast aan de regels.' },
  } as Record<string, { label: string; pros: string; cons: string; after: string }>,
  voices: { ondernemer: 'Mo, ondernemer', bewoner: 'Joke, bewoner', wethouder: 'De wethouder', bezoeker: 'Dennis, bezoeker', stad: 'Gerrit, buurtbewoner', fietser: 'Sanne, fietser' } as Record<string, string>,
  react: {
    ja: { ondernemer: 'Eindelijk iemand die meedenkt. Mijn klanten komen terug.', bewoner: 'Waarom hij wel en wij niet?', wethouder: 'Dit moet ik in de raad kunnen uitleggen.' },
    nee: { ondernemer: 'Regels zijn regels, maar mijn winkel loopt leeg.', wethouder: 'Een consequent besluit. Dat kan ik uitleggen.', bewoner: 'Gelijke monniken, gelijke kappen.' },
  } as Record<string, Record<string, string>>,
};
export const MOMENT = {
  title: 'Marathon Rotterdam', announce: 'Over een kwartaal rent heel Rotterdam over de Coolsingel en de Erasmusbrug. De partners besluiten nog hoe de stad wordt afgesloten. Parkeren is volgend: jij bereidt voor met wat je hebt. Mensen die je nu aanneemt, staan er dan.',
  picks: {
    handhaving: { label: 'Extra handhaving', text: 'Overuren rond de route: minder foutparkeren, dus meer plek.', needs: 'Vraagt Handhaving.' },
    evenementtarief: { label: 'Evenemententarief garages', text: 'Garages rekenen een toeslag: meer inkomsten, iets minder bezoekers.', needs: 'Geeft Klantcontact vragen.' },
    pendel: { label: 'Pendel vanaf P+R', text: 'Bezoekers parkeren aan de rand en komen met de bus: minder auto’s in het Centrum.', needs: 'Geeft Klantcontact vragen.' },
    brief: { label: 'Bewonersbrief', text: 'Bewoners weten wat er gebeurt en zetten hun auto vooraf in de garage.', needs: 'Geeft Klantcontact vragen.' },
  } as Record<string, { label: string; text: string; needs: string }>,
};
/** Newspaper line for the Q4 afrekening: how the Marathon went for parking. */
export function momentHeadline(res: QuarterResult): { title: string; sub: string; good: boolean } | null {
  if (res.q !== GOAL.marathon.quarter) return null;
  const search = res.next.history[res.next.history.length - 1].searchCentrum, good = search <= GOAL.marathon.maxSearch;
  const picks = (res.moment ?? []).map((p) => MOMENT.picks[p].label.toLowerCase());
  const via = picks.length ? ` Jouw maatregelen: ${picks.join(' en ')}.` : ' Je nam geen eigen maatregelen.';
  return good
    ? { title: 'Marathon rolt door, Centrum blijft bereikbaar', sub: `Zoeken duurde ${fmtMin(search)} (doel max ${GOAL.marathon.maxSearch}).${via}`, good }
    : { title: 'Marathon-chaos: auto’s rijden rondjes in het Centrum', sub: `Zoeken duurde ${fmtMin(search)}, het doel was ${GOAL.marathon.maxSearch} minuten.${via}`, good };
}

// ---------------------------------------------------------------- end screen
export function headline(e: Ending, s: Session): { title: string; sub: string } {
  if (e.status.fondsOk === false) return { title: 'Parkeerfonds de min in: wethouder grijpt in', sub: `Het fonds sloot op ${fmtM(e.fonds)}. De raad wil uitleg.` };
  if (e.chaos) return { title: 'Marathon-chaos in het Centrum: auto’s rijden rondjes tot de finish', sub: `Zoektijd in Centrum liep op tot ${minTxt(e.marathonSearch ?? 20)} minuten. Je doel was ${GOAL.marathon.maxSearch}.` };
  if (!e.status.blijOk) return { title: 'Marathon gered, maar Rotterdammer nog steeds chagrijnig over parkeren', sub: `Rotterdammert-score ${Math.round(e.blij)}, je doel was ${GOAL.blijMin}.` };
  if (e.stars >= 3) return { title: 'Parkeren op orde: Marathon zonder chaos, teams niet overbelast', sub: 'Zelfs de wethouder is tevreden.' };
  return { title: 'Marathon zonder chaos: Rotterdammer parkeert weer met een glimlach', sub: `Rotterdammert-score ${Math.round(e.blij)}, fonds ${fmtM(e.fonds)}.` };
}

/** Three lessons that refer to what *this* player did. */
export function lessons(session: Session): string[] {
  const R = session.results, all: PlanItem[] = R.flatMap((r) => r.items), out: string[] = [];
  const built = (k: string) => all.filter((i) => i.kind === k);
  const hired = (r: string) => all.filter((i) => i.role === r).length;
  const garages = built('garage');
  if (garages.length && (hired('schoonmaker') === 0 || hired('monteur') === 0))
    out.push(`Je bouwde ${garages.length === 1 ? 'een garage' : `${garages.length} garages`}, maar nam ${hired('schoonmaker') === 0 ? 'geen schoonmaker' : 'geen monteur'} aan. Elke garage vraagt vaste mensen: bouwen is makkelijk, beheren is het vak.`);
  else if (garages.length) out.push('Je bouwde een garage én nam mensen aan om hem te beheren. Zo hoort het: elke vierkante meter beton heeft ook schoonmaak en onderhoud nodig.');
  const sc = built('scanauto');
  if (sc.length && hired('handhaver') === 0) out.push('Je kocht een scanauto zonder er een handhaver bij aan te nemen. Zo’n auto rijdt pas als er iemand achter het stuur zit.');
  const hoog = all.filter((i) => (i.kind === 'tariff' || i.kind === 'intro') && i.level === 'hoog');
  const last = R[R.length - 1];
  if (hoog.length) {
    const k = last.next.wijken.kuipwijk;
    out.push(`Je zette het tarief in ${hoog.map((h) => wijkName(h.wijk as WijkId)).join(' en ')} op hoog. Dat verjaagt auto’s, maar ze zoeken ergens anders gratis parkeren${hoog.some((h) => h.wijk === 'centrum') && !k.paid ? ', bijvoorbeeld in Feijenoord' : ''}. En ondernemers merken het in hun omzet.`);
  }
  if (built('stalling').length === 0 && last.next.history[last.next.history.length - 1].bikeShort > 0.15) out.push('Je bouwde geen fietsenstalling, terwijl er flinke tekorten waren. Fietsers tellen mee voor een kwart van de Rotterdammert.');
  // the lesson about teams points at the team meters (teambalk) the player can see every quarter
  const reds = R.flatMap((r) => TEAMS.filter((tm) => r.levels[tm] === 'rood').map((tm) => ({ q: r.q + 1, tm, load: r.loads[tm] })));
  if (reds.length) {
    const w = reds.sort((x, y) => y.load - x.load)[0];
    out.push(`In de teambalk stond ${TEAM_INFO[w.tm].name} in kwartaal ${w.q} op rood (werkdruk ${w.load > 1.5 ? 'meer dan 150' : Math.round(w.load * 100)}%). Werk dat blijft liggen wordt een achterstand die doorlekt naar het volgende team. Kijk elk kwartaal naar de balken, voordat je bouwt of een tarief verandert.`);
  } else if (R.length) out.push('Geen enkele balk in de teambalk kwam in het rood. Je nam mensen aan voordat het werk er was: dat levert de derde ster op.');
  const af = R.reduce((a, r) => a + r.money.afgeroomd, 0);
  if (af > 0.5e6) out.push(`Er vloeide ${fmtM(af)} terug naar de gemeente (onderuitputting). Geld dat je aan het jaareinde overhoudt, is weg. Gebruik je fonds dus op tijd.`);
  const chaos = last.next.history.find((h) => h.q === GOAL.marathon.quarter);
  if (chaos && chaos.searchCentrum <= GOAL.marathon.maxSearch) out.push('De Marathon in het Centrum liep goed omdat je op tijd aan de slag ging. Een evenement zie je weken van tevoren aankomen.');
  const fill = [
    'Eén ingreep lost zelden alles op. De Rotterdammert wordt blij van zoektijd, fietsplekken, schone straten én een gezond fonds tegelijk.',
    'Alles hangt aan elkaar: een tarief raakt ondernemers, een scanauto raakt Backoffice, een garage raakt Schoonmaak. Wie dat ziet, plant beter.',
    'Je kunt het fonds niet laten staan: wat je overhoudt vloeit weg, wat je te veel uitgeeft kost je het doel.',
  ];
  for (const f of fill) if (out.length < 3) out.push(f);
  return out.slice(0, 3);
}

export const TOOL_COPY = {
  garage: { name: 'Garage', blurb: '400 plekken. Haalt auto’s van straat. Vraagt schoonmaker en monteur.', hint: 'Een garage heeft een hele bouwplek nodig.' },
  automaat: { name: 'Betaalautomaten', blurb: 'Een set van 5 automaten. Zonder automaten kan niemand betalen. Vraagt een monteur.', hint: 'Een set automaten past op elke bouwplek.' },
  scanauto: { name: 'Scanauto', blurb: 'Rijdt rondes en scant kentekens. Werkt alleen met een handhaver erbij.', hint: 'Kies een wijk: daar gaat de scanauto rijden.' },
  stalling: { name: 'Fietsenstalling', blurb: '1.000 fietsplekken. Fietsers blij, minder fietsen op straat.', hint: 'Een stalling past op elke bouwplek.' },
} as const;
