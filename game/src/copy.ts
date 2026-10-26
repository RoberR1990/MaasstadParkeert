// All player-facing Dutch text that depends on the simulation (explanations, reactions, lessons, headlines, advice).
import type { Cause } from '@sim/round';
import type { Role } from '@sim/types';
import { WIJK_BY_ID, type WijkId } from './wijken';
import { GOAL, ROLE_TEAM, type Ending, type PlanItem, type QuarterResult, type Session } from './session';

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

// ---------------------------------------------------------------- Sap's advice (once, after the first afrekening)
export function sapAdvice(session: Session, res: QuarterResult): string {
  const s = session.state, built = (k: string) => res.items.some((i) => i.kind === k);
  const lv = res.levels;
  if (built('garage') && (lv.schoonmaker !== 'groen' || lv.monteur !== 'groen'))
    return 'Mooie garage, jongen. Maar wie maakt ’m schoon? Neem in het Team-paneel een schoonmaker en een monteur aan. Dat duurt een kwartaal.';
  if (built('scanauto') && lv.handhaver !== 'groen')
    return 'Een scanauto zonder handhaver blijft gewoon staan. Neem iemand aan bij Handhaving, dat duurt een kwartaal.';
  if (s.wijken.centrum.m.search > GOAL.marathon.maxSearch)
    return `Centrum staat nog rood (${minTxt(s.wijken.centrum.m.search)} min). En in kwartaal ${GOAL.marathon.quarter + 1} komt de Marathon: dan wil je daar onder de ${GOAL.marathon.maxSearch} minuten zitten.`;
  if (s.fonds < 10e6) return `Je fonds is ${fmtM(s.fonds)}. Het beheer loopt elk kwartaal door, ook als je niets bouwt. Hou dat in de gaten.`;
  return 'Goed bezig. Maar pas op: wie bouwt, moet ook beheren. Kijk elk kwartaal naar de werkdruk bij de teams.';
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
  const hired = (r: Role) => all.filter((i) => i.role === r).length;
  const anyRed = R.some((r) => Object.values(r.levels).includes('rood'));
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
  if (anyRed) out.push('Minstens één team zat in het rood. Werkdruk loopt op voordat je het in de cijfers ziet; kijk er elk kwartaal naar.');
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
