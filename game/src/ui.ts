// DOM layer for the quarter loop: goal bar, plan card, Beleid/Team panels, afrekening and eindscherm.
// No Three.js in here. main.ts owns the phases and the 3D world; this file only draws and reports clicks.
import { staffNeeds } from '@sim/model';
import type { Role, Tariff } from '@sim/types';
import { ROLES } from '@sim/types';
import { icon } from './icons';
import { PERSONA_NL, causeLines, fmtM, fmtMin, fmtPrice, headline, lessons, reactions, wijkName } from './copy';
import { GOAL, QUARTERS, ROLE_TEAM, cfg, type PlanItem, type QuarterResult, type Session } from './session';
import { WIJKEN, type WijkId } from './wijken';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const LEVELS: Tariff[] = ['laag', 'midden', 'hoog'];
const ROLE_NAME: Record<Role, string> = { handhaver: 'Handhaver', monteur: 'Monteur', schoonmaker: 'Schoonmaker', klantcontact: 'Klantcontact-medewerker' };
const ROLE_WHY: Record<Role, string> = {
  handhaver: 'Controleert en schrijft bonnen. Scanauto’s hebben er een nodig.',
  monteur: 'Repareert betaalautomaten en onderhoudt garages.',
  schoonmaker: 'Houdt straten en garages schoon.',
  klantcontact: 'Beantwoordt vragen en klachten van Rotterdammers.',
};
export type PanelName = 'beleid' | 'team';

export class UI {
  onRemove: (id: number) => void = () => {};
  onNext: () => void = () => {};
  onPolicy: (wijk: WijkId, level: Tariff) => void = () => {};
  onHire: (role: Role) => void = () => {};
  onContinue: () => void = () => {};
  onReplay: () => void = () => {};
  onSound: (k: 'click' | 'error' | 'chime' | 'coin') => void = () => {};
  onPanel: (p: PanelName | null) => void = () => {};
  onFly: (w: WijkId) => void = () => {};
  panel: PanelName | null = null;
  phase: 'plan' | 'play' | 'after' | 'eind' = 'plan';
  private msg = '';

  constructor(private s: Session) {
    $('ico-beleid').innerHTML = icon('beleid');
    $('ico-team').innerHTML = icon('team');
    for (const b of document.querySelectorAll<HTMLElement>('.rail-btn')) b.addEventListener('click', () => { this.onSound('click'); this.togglePanel(b.dataset.panel as PanelName); });
    $('sidepanel').addEventListener('click', (e) => this.panelClick(e.target as HTMLElement));
    $('plan').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const x = t.closest<HTMLElement>('[data-rm]');
      if (x) { this.onSound('click'); this.onRemove(+x.dataset.rm!); return; }
      if (t.closest('#btn-next')) { this.onNext(); return; }
      if (t.closest('.plan-head')) $('plan').classList.toggle('open');
    });
  }

  // ------------------------------------------------------------------ small helpers
  setPhase(p: UI['phase']) {
    this.phase = p;
    document.body.dataset.phase = p;
    if (p !== 'plan') { this.panel = null; this.onPanel(null); }
    this.refresh();
  }
  togglePanel(p: PanelName | null) {
    this.panel = p && this.panel !== p ? p : null;
    this.msg = '';
    this.refresh();
    this.onPanel(this.panel);
  }

  itemLabel(i: PlanItem) {
    const w = i.wijk ? wijkName(i.wijk) : '';
    switch (i.kind) {
      case 'garage': return `Garage · ${w}`;
      case 'automaat': return `${i.n && i.n > 1 ? i.n + ' betaalautomaten' : 'Betaalautomaat'} · ${w}`;
      case 'scanauto': return `Scanauto · ${w}`;
      case 'stalling': return `Fietsenstalling · ${w}`;
      case 'hire': return `${ROLE_NAME[i.role!]} aannemen`;
      case 'tariff': return `Tarief ${w}: ${i.level}`;
      default: return `Betaald parkeren ${w}: ${i.level}`;
    }
  }
  private itemIcon(i: PlanItem) { return icon(i.kind === 'hire' ? 'team' : i.kind === 'tariff' || i.kind === 'intro' ? 'beleid' : i.kind); }
  private itemCost(i: PlanItem) { return i.cost > 0 ? fmtPrice(i.cost) : i.perYear > 0 ? `${fmtPrice(i.perYear)}/jr` : 'gratis'; }

  // ------------------------------------------------------------------ everything that depends on the plan
  refresh() {
    document.body.dataset.panel = this.panel ?? '';
    this.renderGoal();
    this.renderPlan();
    this.renderPanel();
  }

  private renderGoal() {
    const s = this.s, fonds = s.fondsAfterPlan();
    const blij = Math.round(s.blijNow);
    const cen = s.wijkViews().centrum.search;
    const set = (id: string, st: 'ok' | 'mid' | 'bad', txt: string) => {
      const el = $(id); el.dataset.st = st;
      (el.querySelector('.g-st') as HTMLElement).innerHTML = st === 'ok' ? icon('check') : st === 'mid' ? '<b>!</b>' : icon('close');
      (el.querySelector('.g-txt') as HTMLElement).innerHTML = txt;
    };
    set('g-blij', blij >= GOAL.blijMin ? 'ok' : blij >= GOAL.blijMin - 10 ? 'mid' : 'bad', `<span class="g-l">Rotterdammert</span><span class="g-v"><b>${blij}</b> <small>doel ≥ ${GOAL.blijMin}</small></span>`);
    set('g-fonds', fonds >= 3e6 ? 'ok' : fonds >= GOAL.fondsMin ? 'mid' : 'bad', `<span class="g-l">Fonds</span><span class="g-v"><b>${fmtM(fonds)}</b> <small>doel ≥ 0</small></span>`);
    set('g-mara', cen <= GOAL.marathon.maxSearch ? 'ok' : cen <= GOAL.marathon.maxSearch + 4 ? 'mid' : 'bad', `<span class="g-l">Marathon zonder chaos</span><span class="g-v"><b>Centrum ${fmtMin(cen)}</b> <small>max ${GOAL.marathon.maxSearch}</small></span>`);
  }

  private renderPlan() {
    const s = this.s, el = $('plan');
    el.hidden = this.phase !== 'plan';
    if (this.phase !== 'plan') return;
    const q = s.quarter;
    const news = s.news();
    const prev = s.preview();
    const blijNew = prev.history[prev.history.length - 1].blij, blijNow = s.blijNow;
    const d = blijNew - blijNow;
    const last = q === QUARTERS - 1;
    const rows = s.plan.map((i) => `<li><span class="pi-ico">${this.itemIcon(i)}</span><span class="pi-t">${esc(this.itemLabel(i))}</span><span class="pi-c">${this.itemCost(i)}</span><button class="pi-x" data-rm="${i.id}" aria-label="Verwijder uit plan">${icon('close')}</button></li>`).join('');
    const newsText = (n: { kind: string; label: string }) => n.kind === 'groei' ? `${n.label}: meer bewoners en bezoekers` : n.kind === 'marathon-aankondiging' ? `De Marathon Rotterdam komt eraan, over een kwartaal. Centrum moet dan onder de ${GOAL.marathon.maxSearch} minuten zoeken.` : `Marathon Rotterdam is dit kwartaal! Het Centrum loopt vol.`;
    const newsHtml = news.map((n) => `<div class="plan-news ${n.kind}"><span class="pn-ico">${icon(n.kind === 'groei' ? 'city' : 'flag')}</span><span>${esc(newsText(n))}</span></div>`).join('');
    const open = el.classList.contains('open');
    el.innerHTML = `
      <button class="plan-head" aria-label="Plan in- of uitklappen"><b>Plan voor kwartaal ${q + 1}</b><span class="plan-count">${s.plan.length ? s.plan.length + (s.plan.length === 1 ? ' actie' : ' acties') : 'nog leeg'}</span></button>
      <div class="plan-body">
      ${newsHtml}
      ${s.plan.length ? `<ul class="plan-list">${rows}</ul>` : `<p class="plan-empty">Nog niets gepland. Kies hieronder wat je wilt bouwen, of pas Beleid en Team aan.</p>`}
      <div class="plan-sum"><div><span>Nu uitgeven</span><b>${fmtM(s.planCapex())}</b></div><div><span>Erbij per jaar</span><b>${fmtM(s.planPerYear())}</b></div></div>
      <div class="plan-fc"><span>Verwachting Rotterdammert</span><b>${Math.round(blijNow)} <i>→</i> <em class="${d > 0.5 ? 'up' : d < -0.5 ? 'down' : ''}">${Math.round(blijNew)}</em></b></div>
      </div>
      <button class="btn primary plan-go" id="btn-next">${last ? 'Laatste kwartaal' : 'Volgend kwartaal'} <span class="go-ico">${icon('play')}</span></button>`;
    el.classList.toggle('open', open);
  }

  // ------------------------------------------------------------------ side panels
  private renderPanel() {
    const el = $('sidepanel');
    for (const b of document.querySelectorAll<HTMLElement>('.rail-btn')) b.classList.toggle('on', b.dataset.panel === this.panel);
    if (!this.panel || this.phase !== 'plan') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = this.panel === 'beleid' ? this.beleidHtml() : this.teamHtml();
  }

  private beleidHtml() {
    const s = this.s, views = s.wijkViews();
    const rows = WIJKEN.map((w) => {
      const v = views[w.id];
      const pend = s.plan.find((p) => (p.kind === 'tariff' || p.kind === 'intro') && p.wijk === w.id);
      const cur = v.paid ? v.tariff : null;
      const seg = LEVELS.map((l) => {
        const sel = pend ? pend.level === l : cur === l;
        return `<button class="seg ${sel ? (pend ? 'sel pend' : 'sel') : ''}" data-pol="${w.id}:${l}">${l[0].toUpperCase() + l.slice(1)}</button>`;
      }).join('');
      const state = v.paid ? `Betaald · ${v.tariff}` : 'Gratis parkeren';
      const tip = v.paid ? 'Duurder: minder auto’s, meer inkomsten. Maar ondernemers en bezoekers klagen sneller.' : 'Kies een tarief om betaald parkeren in te voeren. Het is even wennen voor de buurt.';
      return `<div class="pol-row"><div class="pol-head"><i class="dot" style="background:${w.color}"></i><b>${w.short}</b><span class="pol-state ${v.paid ? 'paid' : ''}">${state}</span></div>
        <div class="pol-seg" role="group" aria-label="Tarief ${w.short}">${v.paid ? '' : '<span class="pol-intro">Invoeren:</span>'}${seg}</div>
        <small>${tip}</small></div>`;
    }).join('');
    return `<div class="sp-head"><b>Beleid</b><button class="sp-x" data-close aria-label="Sluiten">${icon('close')}</button></div>
      <p class="sp-lead">Bepaal per wijk of parkeren betaald is en hoe duur.</p>${rows}${this.msg ? `<p class="sp-msg">${esc(this.msg)}</p>` : ''}${this.doneBtn()}`;
  }

  private teamHtml() {
    const s = this.s, prev = s.preview();
    const need = staffNeeds(prev, cfg, true);
    const L = s.loads(prev);
    const rows = ROLES.map((r) => {
      const info = s.staffInfo(r);
      const lv = L.levels[r], load = L.loads[r];
      const pct = Math.min(100, Math.round((load / 1.4) * 100));
      const word = lv === 'groen' ? 'Genoeg mensen' : lv === 'oranje' ? 'Druk' : 'Overbelast';
      const queued = s.plan.filter((p) => p.role === r).length;
      return `<div class="team-row"><div class="pol-head"><b>${ROLE_TEAM[r].team}</b><span class="lvl ${lv}">${word}</span></div>
        <div class="load"><i class="${lv}" style="width:${pct}%"></i><span class="mark" style="left:${(GOAL.loadOrange / 1.4) * 100}%"></span></div>
        <div class="team-meta"><span>${ROLE_NAME[r]}: <b>${info.have.toFixed(1).replace('.', ',')}</b>${info.coming ? ` <em>(+${info.coming} onderweg)</em>` : ''} · nodig <b>${need[r].toFixed(1).replace('.', ',')}</b></span>
        <button class="btn mini" data-hire="${r}" aria-label="${ROLE_NAME[r]} aannemen">+ Aannemen${queued ? ` (${queued})` : ''}<small>${fmtPrice(cfg.staff.salary[r])}/jr</small></button></div>
        <small>${ROLE_WHY[r]}</small></div>`;
    }).join('');
    return `<div class="sp-head"><b>Team</b><button class="sp-x" data-close aria-label="Sluiten">${icon('close')}</button></div>
      <p class="sp-lead">Nieuw personeel begint na een kwartaal. Wacht je te lang, dan raakt het team overbelast.</p>${rows}${this.msg ? `<p class="sp-msg">${esc(this.msg)}</p>` : ''}${this.doneBtn()}`;
  }

  private doneBtn() {
    const n = this.s.plan.length;
    return `<button class="btn primary sp-done" data-close>Klaar${n ? ` · ${n} ${n === 1 ? 'actie' : 'acties'} in je plan` : ''}</button>`;
  }

  say(text: string) { this.msg = text; this.renderPanel(); }

  private panelClick(t: HTMLElement) {
    if (t.closest('[data-close]')) { this.onSound('click'); this.togglePanel(null); return; }
    const pol = t.closest<HTMLElement>('[data-pol]');
    if (pol) { const [w, l] = pol.dataset.pol!.split(':'); this.onPolicy(w as WijkId, l as Tariff); return; }
    const hire = t.closest<HTMLElement>('[data-hire]');
    if (hire) this.onHire(hire.dataset.hire as Role);
  }

  // ------------------------------------------------------------------ modal cards
  hideModal() { const m = $('modal'); m.classList.add('hidden'); m.innerHTML = ''; }

  showAfrekening(res: QuarterResult) {
    const m = $('modal'), s = this.s;
    const mo = res.money, last = res.q === QUARTERS - 1;
    const line = (l: string, v: number, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${fmtM(v)}</td></tr>`;
    const d = res.blijNew - res.blijOld;
    const dcls = d > 0.5 ? 'up' : d < -0.5 ? 'down' : '';
    const causes = causeLines(res, s);
    const reacts = reactions(res);
    const wrows = res.wijken.map((w) => {
      const cls = w.searchNew < w.searchOld - 0.3 ? 'up' : w.searchNew > w.searchOld + 0.3 ? 'down' : '';
      const sev = w.searchNew > 9 ? 'bad' : w.searchNew > 5 ? 'mid' : 'ok';
      return `<tr><td><i class="dot" style="background:${WIJKEN.find((x) => x.id === w.id)!.color}"></i>${wijkName(w.id)}</td><td>${fmtMin(w.searchOld)}</td><td class="arrow">→</td><td class="${cls}"><span class="sev ${sev}">${fmtMin(w.searchNew)}</span></td><td class="muted">${Math.round(w.bezNew * 100)}% vol</td></tr>`;
    }).join('');
    const bar = (id: string) => {
      const o = res.personaOld[id], n = res.personaNew[id], dd = n - o;
      return `<div class="pr"><span>${PERSONA_NL[id]}</span><b>${Math.round(o)}</b><i>→</i><b class="${dd > 0.5 ? 'up' : dd < -0.5 ? 'down' : ''}">${Math.round(n)}</b></div>`;
    };
    m.innerHTML = `<div class="card afr" role="dialog" aria-label="Afrekening kwartaal ${res.q + 1}">
      <div class="card-head"><span class="eyebrow">Afrekening</span><h2>Kwartaal ${res.q + 1} van ${QUARTERS}</h2></div>
      <div class="afr-grid">
        <section class="afr-mood">
          <div class="big-score"><span class="lbl">Rotterdammert</span><div class="bs"><b>${Math.round(res.blijOld)}</b><i>→</i><b class="${dcls}">${Math.round(res.blijNew)}</b><span class="bs-d ${dcls}">${d > 0.05 ? '+' : d < -0.05 ? '−' : '±'}${Math.abs(d).toFixed(1).replace('.', ',')}</span></div></div>
          <h3>Waarom?</h3>
          <ol class="causes">${causes.map((c) => `<li class="${c.good ? 'good' : 'bad'}"><span class="c-ico">${icon(c.good ? 'check' : 'warn')}</span><span>${esc(c.text)}</span></li>`).join('') || '<li class="flat"><span>Er is weinig veranderd. Plan het volgende kwartaal iets.</span></li>'}</ol>
          <div class="reacts">${reacts.map((r) => `<div class="react"><div class="r-av ${r.delta >= 0 ? 'up' : 'down'}">${esc(r.who === 'De wethouder' ? 'W' : r.who[0])}</div><div class="r-b"><b>${esc(r.who)}</b><p>“${esc(r.text)}”</p></div></div>`).join('')}</div>
        </section>
        <section class="afr-side">
          <h3>Geld</h3>
          <table class="money">
            <tr class="sec"><td colspan="2">Inkomsten</td></tr>
            ${line('Straatparkeren', mo.revStreet)}${line('Garages', mo.revGarage)}${line('Vergunningen en boetes', mo.revPermit)}
            <tr class="sec"><td colspan="2">Uitgaven</td></tr>
            ${mo.capex ? line('Bouwen en kopen', -mo.capex) : ''}${line('Personeel', -mo.staff)}${line('Beheer en onderhoud', -mo.opex)}${line('Overhead', -(mo.overhead + mo.ovCost))}
            ${line('Saldo dit kwartaal', mo.saldo, 'tot')}
            <tr class="fonds"><td>Fonds</td><td>${fmtM(mo.fondsOld)} <i>→</i> <b>${fmtM(mo.fondsNew)}</b></td></tr>
          </table>
          ${mo.afgeroomd > 1 ? `<p class="afgeroomd">Aan het eind van het jaar vloeit ${fmtM(mo.afgeroomd)} terug naar de gemeente.</p>` : ''}
          <h3>Zoektijd per wijk</h3>
          <table class="wijk">${wrows}</table>
          <h3>Zes groepen</h3>
          <div class="prs">${['bewoner', 'ondernemer', 'bezoeker', 'fietser', 'stad', 'wethouder'].map(bar).join('')}</div>
        </section>
      </div>
      <div class="card-foot"><button class="btn primary big" id="btn-continue">${last ? 'Naar de uitslag' : `Naar kwartaal ${res.q + 2}`} <span class="go-ico">${icon('play')}</span></button></div>
    </div>`;
    m.classList.remove('hidden');
    $('btn-continue').addEventListener('click', () => { this.onSound('click'); this.onContinue(); });
  }

  showEind() {
    const s = this.s, e = s.ending(), h = headline(e, s), L = lessons(s);
    const m = $('modal');
    const st = e.stars;
    const row = (ok: boolean, label: string, val: string) => `<li class="${ok ? 'ok' : 'no'}"><span>${icon(ok ? 'check' : 'close')}</span><b>${label}</b><em>${val}</em></li>`;
    const chaos = e.marathonSearch;
    m.innerHTML = `<div class="card eind" role="dialog" aria-label="Eindresultaat">
      <div class="paper">
        <div class="mast"><span>Maasstad Courant</span><i>Jaar 1 · uitslag</i></div>
        <h1>${esc(h.title)}</h1>
        <p class="deck">${esc(h.sub)}</p>
      </div>
      <div class="eind-grid">
        <div class="eind-score">
          <span class="lbl">Rotterdammert</span>
          <div class="score-num ${e.status.blijOk ? 'ok' : 'no'}">${Math.round(e.blij)}</div>
          <div class="stars" aria-label="${st} van 3 sterren">${[1, 2, 3].map((i) => `<span class="star ${i <= st ? 'on' : ''}" style="--d:${i * 0.25}s">${icon('star')}</span>`).join('')}</div>
          <p class="stars-t">${st === 0 ? 'Doel niet gehaald' : st === 1 ? 'Doel gehaald' : st === 2 ? 'Doel gehaald met geld over' : 'Doel gehaald, geld over en geen team overbelast'}</p>
        </div>
        <div class="eind-side">
          <ul class="goal-list">
            ${row(e.status.blijOk, `Rotterdammert ≥ ${GOAL.blijMin}`, String(Math.round(e.blij)))}
            ${row(e.status.fondsOk, 'Fonds ≥ 0', fmtM(e.fonds))}
            ${row(!e.chaos, 'Marathon zonder chaos', chaos == null ? '-' : `Centrum ${fmtMin(chaos)}`)}
          </ul>
          <h3>Wat je hiervan leert</h3>
          <ol class="lessons">${L.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
        </div>
      </div>
      <div class="card-foot"><button class="btn primary big" id="btn-replay">Opnieuw spelen <span class="go-ico">${icon('rotate')}</span></button></div>
    </div>`;
    m.classList.remove('hidden');
    $('btn-replay').addEventListener('click', () => { this.onSound('click'); this.onReplay(); });
  }

  /** wijk chips for the diorama (HTML, positioned by main) */
  buildChips() {
    const root = $('wijkchips'); root.innerHTML = '';
    const out = new Map<WijkId, HTMLElement>();
    for (const w of WIJKEN) {
      const b = document.createElement('button');
      b.className = 'wchip'; b.dataset.w = w.id;
      b.innerHTML = `<i class="dot" style="background:${w.color}"></i><span class="w-n">${w.short}</span><span class="w-t"></span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onFly(w.id); });
      root.appendChild(b); out.set(w.id, b);
    }
    return out;
  }
}
