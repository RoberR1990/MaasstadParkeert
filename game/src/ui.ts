// DOM layer for the quarter loop: goal bar, plan card, teambar, Beleid / wijk / Moment panels, forecast card, afrekening and eindscherm.
// No Three.js in here. main.ts owns the phases and the 3D world; this file only draws and reports clicks.
import { teamLevel } from '@sim/round';
import type { Forecast } from '@sim/forecast';
import type { TeamId, Tariff } from '@sim/types';
import { TEAMS } from '@sim/types';
import { icon } from './icons';
import { DILEMMA, MOMENT, PERSONA_NL, TEAM_INFO, bezWord, causeLines, fmtM, fmtMin, fmtPrice, fte1, headline, lessons, levelWord, momentHeadline, pickChain, reactions, teamTip, wijkName, type Chain } from './copy';
import { GOAL, QUARTERS, TC, UI_CFG, cfg, salaryOf, type PlanItem, type QuarterResult, type Session } from './session';
import { WIJKEN, WIJK_BY_ID, type WijkId } from './wijken';
import { teamAvatar } from './teamart';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const LEVELS: Tariff[] = ['laag', 'midden', 'hoog'];
export type PanelName = 'beleid' | 'wijk' | 'moment' | 'team';
const rm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sgn = (v: number, d = 0) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d).replace('.', ',')}`;

export class UI {
  onRemove: (id: number) => void = () => {};
  onRemovePick: (id: string) => void = () => {};
  onNext: () => void = () => {};
  onPolicy: (wijk: WijkId, level: Tariff) => void = () => {};
  onHire: (team: TeamId) => void = () => {};
  onContinue: () => void = () => {};
  onReplay: () => void = () => {};
  onSound: (k: 'click' | 'error' | 'chime' | 'coin') => void = () => {};
  onPanel: (p: PanelName | null) => void = () => {};
  onFly: (w: WijkId) => void = () => {};
  onHeat: (on: boolean) => void = () => {};
  onWijk: (w: WijkId | null) => void = () => {};
  onPick: (id: string, on: boolean) => void = () => {};
  panel: PanelName | null = null;
  wijkSel: WijkId | null = null;
  teamSel: TeamId | null = null;
  heatOn = true;
  phase: 'plan' | 'play' | 'after' | 'eind' = 'plan';
  private msg = '';
  private polHover: { wijk: WijkId; level: Tariff } | null = null;
  private chainTimers: number[] = [];

  constructor(private s: Session) {
    $('ico-beleid').innerHTML = icon('beleid');
    $('ico-heat').innerHTML = icon('heat');
    $('ico-moment').innerHTML = icon('flag');
    for (const b of document.querySelectorAll<HTMLElement>('.rail-btn[data-panel]')) b.addEventListener('click', () => { this.onSound('click'); this.togglePanel(b.dataset.panel as PanelName); });
    $('btn-heat').addEventListener('click', () => { this.onSound('click'); this.setHeat(!this.heatOn); });
    $('sidepanel').addEventListener('click', (e) => this.panelClick(e.target as HTMLElement));
    const hov = (e: Event) => {
      const seg = (e.target as HTMLElement).closest<HTMLElement>('[data-pol]');
      if (seg && this.panel === 'beleid') { const [w, l] = seg.dataset.pol!.split(':'); this.showPolForecast(w as WijkId, l as Tariff); }
    };
    $('sidepanel').addEventListener('pointerover', (e) => { if ((e as PointerEvent).pointerType !== 'touch') hov(e); });
    $('teambar').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const hire = t.closest<HTMLElement>('[data-hire]');
      if (hire) { e.stopPropagation(); this.onHire(hire.dataset.hire as TeamId); return; }
      const card = t.closest<HTMLElement>('[data-team]');
      if (card) { this.onSound('click'); this.openTeam(card.dataset.team as TeamId); }
    });
    $('plan').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const x = t.closest<HTMLElement>('[data-rm]');
      if (x) { this.onSound('click'); this.onRemove(+x.dataset.rm!); return; }
      const xp = t.closest<HTMLElement>('[data-rmpick]');
      if (xp) { this.onSound('click'); this.onRemovePick(xp.dataset.rmpick!); return; }
      if (t.closest('#btn-next')) { this.onNext(); return; }
      if (t.closest('.plan-head')) $('plan').classList.toggle('open');
    });
  }

  // ------------------------------------------------------------------ small helpers
  setPhase(p: UI['phase']) {
    this.phase = p;
    document.body.dataset.phase = p;
    if (p !== 'plan') { this.panel = null; this.onPanel(null); this.hideForecast(); }
    this.refresh();
  }
  togglePanel(p: PanelName | null) {
    this.panel = p && this.panel !== p ? p : null;
    if (this.panel !== 'wijk') { this.wijkSel = null; this.onWijk(null); }
    if (this.panel !== 'team') this.teamSel = null;
    this.polHover = null;
    this.msg = '';
    this.hideForecast();
    this.refresh();
    this.onPanel(this.panel);
  }
  openWijk(id: WijkId) {
    this.wijkSel = id; this.panel = 'wijk'; this.msg = ''; this.hideForecast(); this.teamSel = null;
    this.refresh(); this.onPanel('wijk'); this.onWijk(id);
  }
  openTeam(id: TeamId) {
    if (this.panel === 'team' && this.teamSel === id) { this.togglePanel(null); return; }
    this.teamSel = id; this.panel = 'team'; this.wijkSel = null; this.msg = ''; this.hideForecast();
    this.onWijk(null); this.refresh(); this.onPanel('team');
  }
  openMoment() { if (this.panel !== 'moment') this.togglePanel('moment'); }
  setHeat(on: boolean) { this.heatOn = on; $('btn-heat').classList.toggle('on', on); this.onHeat(on); }

  itemLabel(i: PlanItem) {
    const w = i.wijk ? wijkName(i.wijk) : '';
    switch (i.kind) {
      case 'garage': return `Garage · ${w}`;
      case 'automaat': return `${i.n && i.n > 1 ? i.n + ' betaalautomaten' : 'Betaalautomaat'} · ${w}`;
      case 'scanauto': return `Scanauto · ${w}`;
      case 'stalling': return `Fietsenstalling · ${w}`;
      case 'hire': return `${TEAM_INFO[i.team!].name}: +1 aannemen`;
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
    this.renderTeambar();
    $('btn-moment').classList.toggle('hidden', !(this.phase === 'plan' && this.s.isMomentQuarter()));
    $('btn-heat').classList.toggle('hidden', this.phase !== 'plan');
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
    let rows = s.plan.map((i) => `<li><span class="pi-ico">${this.itemIcon(i)}</span><span class="pi-t">${esc(this.itemLabel(i))}</span><span class="pi-c">${this.itemCost(i)}</span><button class="pi-x" data-rm="${i.id}" aria-label="Verwijder uit plan">${icon('close')}</button></li>`).join('');
    if (s.isMomentQuarter()) rows += s.momentPicks.map((p) => `<li><span class="pi-ico">${icon('flag')}</span><span class="pi-t">Marathon: ${esc(MOMENT.picks[p].label)}</span><span class="pi-c">${fmtPrice(TC.moment.picks[p].cost)}</span><button class="pi-x" data-rmpick="${p}" aria-label="Verwijder uit plan">${icon('close')}</button></li>`).join('');
    const count = s.plan.length + (s.isMomentQuarter() ? s.momentPicks.length : 0);
    const newsText = (n: { kind: string; label: string }) => n.kind === 'groei' ? `${n.label}: meer bewoners en bezoekers` : n.kind === 'marathon-aankondiging' ? `De Marathon Rotterdam komt eraan, over een kwartaal. Centrum moet dan onder de ${GOAL.marathon.maxSearch} minuten zoeken.` : `Marathon Rotterdam is dit kwartaal! De partners sluiten de route af: open Marathon links en kies wat Parkeren doet.`;
    const newsHtml = news.map((n) => `<div class="plan-news ${n.kind}"><span class="pn-ico">${icon(n.kind === 'groei' ? 'city' : 'flag')}</span><span>${esc(newsText(n))}</span></div>`).join('');
    const open = el.classList.contains('open');
    el.innerHTML = `
      <button class="plan-head" aria-label="Plan in- of uitklappen"><b>Plan voor kwartaal ${q + 1}</b><span class="plan-count">${count ? count + (count === 1 ? ' actie' : ' acties') : 'nog leeg'}</span></button>
      <div class="plan-body">
      ${newsHtml}
      ${rows ? `<ul class="plan-list">${rows}</ul>` : `<p class="plan-empty">Nog niets gepland. Kies hieronder wat je wilt bouwen, of pas Beleid aan en neem mensen aan in de teambalk.</p>`}
      <div class="plan-sum"><div><span>Nu uitgeven</span><b>${fmtM(s.planCapex())}</b></div><div><span>Erbij per jaar</span><b>${fmtM(s.planPerYear())}</b></div></div>
      <div class="plan-fc"><span>Verwachting Rotterdammert</span><b>${Math.round(blijNow)} <i>→</i> <em class="${d > 0.5 ? 'up' : d < -0.5 ? 'down' : ''}">${Math.round(blijNew)}</em></b></div>
      </div>
      <button class="btn primary plan-go" id="btn-next">${last ? 'Laatste kwartaal' : 'Volgend kwartaal'} <span class="go-ico">${icon('play')}</span></button>`;
    el.classList.toggle('open', open);
  }

  // ------------------------------------------------------------------ teambar
  private renderTeambar() {
    const el = $('teambar');
    el.hidden = this.phase !== 'plan';
    if (this.phase !== 'plan') return;
    const s = this.s, v = s.upcomingViews(), max = UI_CFG.meterMax;
    el.innerHTML = TEAMS.map((t) => {
      const x = v[t], info = TEAM_INFO[t], pct = Math.min(100, Math.round((x.load / max) * 100));
      const hot = s.plan.some((p) => p.team === t);
      return `<div class="tc ${x.level}${this.teamSel === t && this.panel === 'team' ? ' sel' : ''}" data-team="${t}" data-tip="${esc(teamTip(x))}" role="button" tabindex="0" aria-label="${info.name}: ${levelWord(x.level)}">
        <div class="tc-av">${teamAvatar(t)}</div>
        <div class="tc-main">
          <div class="tc-name">${info.short}</div>
          <div class="tc-meter" role="meter" aria-valuenow="${Math.round(x.load * 100)}" aria-valuemin="0" aria-valuemax="140"><i class="${x.level}" style="width:${pct}%"></i><span class="mark" style="left:${(GOAL.loadOrange / max) * 100}%"></span><span class="mark red" style="left:${(GOAL.loadRed / max) * 100}%"></span></div>
          <div class="tc-meta"><span><b>${fte1(x.fte)}</b>${x.coming ? `<em>+${x.coming}</em>` : ''} FTE</span><i class="lvdot ${x.level}" title="${levelWord(x.level)}">${x.level === 'groen' ? '✓' : x.level === 'oranje' ? '!' : '✕'}</i></div>
        </div>
        <button class="tc-hire${hot ? ' hot' : ''}" data-hire="${t}" aria-label="${info.name}: 1 FTE aannemen voor ${fmtPrice(salaryOf(t))} per jaar"><b>+1</b><small>${fmtPrice(salaryOf(t))}/jr</small></button>
      </div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ side panels
  private renderPanel() {
    const el = $('sidepanel');
    for (const b of document.querySelectorAll<HTMLElement>('.rail-btn[data-panel]')) b.classList.toggle('on', b.dataset.panel === this.panel);
    if (!this.panel || this.phase !== 'plan') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.dataset.kind = this.panel;
    const keep = el.scrollTop;
    el.innerHTML = this.panel === 'beleid' ? this.beleidHtml() : this.panel === 'wijk' ? this.wijkHtml() : this.panel === 'moment' ? this.momentHtml() : this.teamHtml();
    el.scrollTop = keep;
    if (this.panel === 'beleid' && this.polHover) this.showPolForecast(this.polHover.wijk, this.polHover.level);
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
      <p class="sp-lead">Bepaal per wijk of parkeren betaald is en hoe duur. Wijs een knop aan om te zien wat er verandert.</p>${rows}<div id="pol-fc" class="fcard inline"><p class="fc-hint">Wijs een tarief aan voor een voorspelling.</p></div>${this.msg ? `<p class="sp-msg">${esc(this.msg)}</p>` : ''}${this.doneBtn()}`;
  }

  private wijkHtml() {
    const id = this.wijkSel ?? 'centrum', m = WIJK_BY_ID[id], d = this.s.wijkDetail(id), bw = bezWord(d.bez);
    const sev = d.search > GOAL.marathon.maxSearch ? 'bad' : d.search > 5 ? 'mid' : 'ok';
    const price = d.paid ? `Ja · tarief ${d.tariff} (${cfg.policy.tariffEur[d.tariff]} € per uur)` : 'Nee · parkeren is gratis';
    const klachtTxt = d.klachtenLevel === 'hoog' ? 'Veel' : d.klachtenLevel === 'middel' ? 'Af en toe' : 'Weinig';
    return `<div class="sp-head"><b><i class="dot" style="background:${m.color}"></i> ${esc(m.name)}</b><button class="sp-x" data-close aria-label="Sluiten">${icon('close')}</button></div>
      <p class="sp-lead">${esc(m.sub)}</p>
      <div class="wp-bez ${bw.sev}">${esc(bw.long)}</div>
      <div class="wp-grid">
        <div><span>Zoektijd</span><b><span class="sev ${sev}">${fmtMin(d.search)}</span></b></div>
        <div><span>Inkomsten</span><b>${fmtM(d.revenuePerYear)}<small>per jaar</small></b></div>
        <div><span>Klachten</span><b class="kl ${d.klachtenLevel}">${klachtTxt}<small>${d.klachten} dit kwartaal</small></b></div>
        <div><span>Betaald parkeren</span><b class="txt">${esc(price)}</b></div>
      </div>
      ${d.introLeft > 0 ? `<p class="sp-note">Rotterdammers wennen nog aan betaald parkeren.</p>` : ''}
      ${!d.paid ? `<button class="btn mini wp-go" data-open-beleid>Naar Beleid</button>` : ''}
      ${this.doneBtn()}`;
  }

  private teamHtml() {
    const t = this.teamSel ?? 'handhaving', info = TEAM_INFO[t], v = this.s.upcomingViews()[t];
    const parts = Object.entries(v.parts).filter(([, x]) => x > 0.04).map(([k, x]) => `<li><span>${esc(k)}</span><b>${fte1(x)}</b></li>`).join('');
    void parts;
    return `<div class="sp-head"><b>${esc(info.name)}</b><button class="sp-x" data-close aria-label="Sluiten">${icon('close')}</button></div>
      <div class="tp-top"><div class="tp-av">${teamAvatar(t)}</div><div><b>${info.person}</b><p>${esc(info.does)}</p></div></div>
      <p class="sp-lead">${esc(teamTip(v).split('|')[1])}</p>
      <button class="btn primary sp-done" data-hire="${t}">+1 aannemen · ${fmtPrice(salaryOf(t))}/jr</button>
      ${this.msg ? `<p class="sp-msg">${esc(this.msg)}</p>` : ''}${this.doneBtn()}`;
  }

  private momentHtml() {
    const s = this.s, mc = TC.moment, views = s.upcomingViews();
    const picks = Object.entries(mc.picks).map(([id, p]) => {
      const on = s.momentPicks.includes(id), f = s.forecastPick(id), copy = MOMENT.picks[id];
      const loads = Object.entries(p.load ?? {}).map(([tm, v]) => {
        const lv = teamLevel(views[tm as TeamId].load + (on ? 0 : (v as number) / Math.max(0.5, views[tm as TeamId].fte)), cfg);
        return `<i class="ft ${lv}">${TEAM_INFO[tm as TeamId].short} +${fte1(v as number)} FTE werk</i>`;
      }).join('');
      const dS = f.searchNew - f.searchOld;
      const eff = s.momentPicks.includes(id) ? '' : '';
      void eff;
      return `<button class="pick ${on ? 'on' : ''}" data-pick="${id}" aria-pressed="${on}"><span class="pk-t"><b>${esc(copy.label)}</b><em>${fmtPrice(p.cost)}</em></span>
        <span class="pk-d">${esc(copy.text)}</span>
        <span class="pk-f">${Math.abs(dS) >= 0.05 ? `<i class="ft ${dS < 0 ? 'groen' : 'rood'}">Zoeken Centrum ${sgn(dS, 1)} min</i>` : ''}${loads}</span></button>`;
    }).join('');
    return `<div class="sp-head"><b>${MOMENT.title}</b><button class="sp-x" data-close aria-label="Sluiten">${icon('close')}</button></div>
      <div class="mo-partner"><span class="mo-tag">Partners besluiten eerst</span><b>${esc(mc.partner.text)}</b><small>Garages rond de route zijn minder goed bereikbaar. Parkeren is volgend.</small></div>
      <p class="sp-lead">Kies maximaal ${mc.maxPicks} maatregelen van Parkeren. Elke maatregel kost geld en werk voor een team: heeft dat team geen ruimte, dan werkt hij maar half.</p>
      <div class="picks">${picks}</div>
      ${this.msg ? `<p class="sp-msg">${esc(this.msg)}</p>` : ''}${this.doneBtn()}`;
  }

  private doneBtn() {
    const n = this.s.plan.length + (this.s.isMomentQuarter() ? this.s.momentPicks.length : 0);
    return `<button class="btn primary sp-done" data-close>Klaar${n ? ` · ${n} ${n === 1 ? 'actie' : 'acties'} in je plan` : ''}</button>`;
  }

  say(text: string) { this.msg = text; this.renderPanel(); }

  private panelClick(t: HTMLElement) {
    if (t.closest('[data-close]')) { this.onSound('click'); this.togglePanel(null); return; }
    if (t.closest('[data-open-beleid]')) { this.onSound('click'); this.togglePanel('beleid'); return; }
    const pol = t.closest<HTMLElement>('[data-pol]');
    if (pol) { const [w, l] = pol.dataset.pol!.split(':'); this.polHover = { wijk: w as WijkId, level: l as Tariff }; this.onPolicy(w as WijkId, l as Tariff); return; }
    const hire = t.closest<HTMLElement>('[data-hire]');
    if (hire) { this.onHire(hire.dataset.hire as TeamId); return; }
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick) { this.onPick(pick.dataset.pick!, !this.s.momentPicks.includes(pick.dataset.pick!)); }
  }

  // ------------------------------------------------------------------ forecast card
  /** compact "what happens if" card: search time, Rotterdammert, money and extra work per team */
  forecastHtml(f: Forecast, title: string, nowCost: number | null = null): string {
    const row = (l: string, v: string) => `<div class="fc-row"><span>${l}</span><b>${v}</b></div>`;
    const dB = f.blijNew - f.blijOld, net = f.revPerYear - f.costPerYear;
    const sev = (m: number) => (m > GOAL.marathon.maxSearch ? 'bad' : m > 5 ? 'mid' : 'ok');
    const teams = TEAMS.filter((t) => Math.abs(f.teamDelta[t]) >= 3).sort((a, b) => Math.abs(f.teamDelta[b]) - Math.abs(f.teamDelta[a]))
      .map((t) => `<i class="ft ${teamLevel(f.teamLoad[t], cfg)}">${TEAM_INFO[t].short} ${sgn(f.teamDelta[t])}%</i>`).join('');
    const now = nowCost ?? f.costNow;
    return `<div class="fc-t">${esc(title)}</div>
      ${f.wijk ? row(`Zoektijd ${wijkName(f.wijk as WijkId)}`, `<span class="sev ${sev(f.searchOld)}">${fmtMin(f.searchOld)}</span> → <span class="sev ${sev(f.searchNew)}">${fmtMin(f.searchNew)}</span>`) : ''}
      ${row('Rotterdammert', `${Math.round(f.blijOld)} → ${Math.round(f.blijNew)} <em class="${dB > 0.4 ? 'up' : dB < -0.4 ? 'down' : ''}">${Math.abs(dB) < 0.05 ? '±0' : sgn(dB, 1)}</em>`)}
      ${row('Kost nu', now > 5e3 ? fmtM(-now) : now < -5e3 ? `+${fmtM(-now)}` : 'gratis')}
      ${row('Per jaar (netto)', `<em class="${net > 2e4 ? 'up' : net < -2e4 ? 'down' : ''}">${Math.abs(net) < 1e4 ? '±0' : fmtM(net, true)}</em>`)}
      ${teams ? `<div class="fc-teams"><span>Werkdruk erbij</span>${teams}</div>` : ''}`;
  }
  showForecast(f: Forecast, title: string, at: { x: number; y: number } | null, nowCost: number | null = null) {
    const el = $('fcard');
    el.innerHTML = this.forecastHtml(f, title, nowCost);
    el.classList.remove('hidden');
    const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    if (matchMedia('(max-width: 700px)').matches || !at) { el.style.left = ''; el.style.top = ''; el.classList.add('sheet'); return; }
    el.classList.remove('sheet');
    let x = at.x + 22, y = at.y + 18;
    if (x + w > W - 12) x = at.x - w - 22;
    if (y + h > H - 12) y = H - h - 12;
    el.style.left = `${Math.max(8, x)}px`; el.style.top = `${Math.max(70, y)}px`;
  }
  hideForecast() { $('fcard').classList.add('hidden'); }
  private showPolForecast(wijk: WijkId, level: Tariff) {
    this.polHover = { wijk, level };
    const box = document.getElementById('pol-fc'); if (!box) return;
    const view = this.s.wijkViews()[wijk];
    if (view.paid && view.tariff === level) { box.innerHTML = `<p class="fc-hint">${wijkName(wijk)} heeft al tarief ${level}.</p>`; return; }
    const f = this.s.forecast([view.paid ? { type: 'setTariff', wijk, level } : { type: 'introducePaid', wijk, level }], wijk);
    box.innerHTML = this.forecastHtml(f, `${view.paid ? 'Tarief' : 'Betaald parkeren'} ${wijkName(wijk)}: ${level}`, 0);
  }

  // ------------------------------------------------------------------ modal cards
  hideModal() { const m = $('modal'); this.clearChain(); m.classList.add('hidden'); m.innerHTML = ''; }

  /** The one dilemma of the year: two options with their trade-offs. */
  showDilemma(onChoose: (key: string) => void) {
    const m = $('modal'), opts = Object.entries(DILEMMA.options);
    m.innerHTML = `<div class="card dilemma" role="dialog" aria-label="Dilemma">
      <div class="card-head"><span class="eyebrow gold">Dilemma</span><h2>${esc(DILEMMA.title)}</h2></div>
      <p class="dl-text">${esc(DILEMMA.text)}</p>
      <p class="dl-note">Er is geen goed of fout antwoord. Elke keuze heeft een prijs.</p>
      <div class="dl-opts">${opts.map(([k, o]) => `<button class="dl-opt" data-choice="${k}"><b>${esc(o.label)}</b><span class="pro">${icon('check')}${esc(o.pros)}</span><span class="con">${icon('warn')}${esc(o.cons)}</span></button>`).join('')}</div>
    </div>`;
    m.classList.remove('hidden');
    for (const b of m.querySelectorAll<HTMLElement>('[data-choice]')) b.addEventListener('click', () => { this.onSound('click'); this.hideModal(); onChoose(b.dataset.choice!); });
  }
  /** Q3: the Marathon is announced */
  showMomentAnnounce(onOk: () => void) {
    const m = $('modal');
    m.innerHTML = `<div class="card dilemma" role="dialog" aria-label="Aankondiging Marathon">
      <div class="card-head"><span class="eyebrow gold">Aankondiging</span><h2>${MOMENT.title}: over een kwartaal</h2></div>
      <p class="dl-text">${esc(MOMENT.announce)}</p>
      <p class="dl-note">Wat je nu aanneemt, staat er dan. Neem vooral Handhaving en Klantcontact in de teambalk niet te laat aan.</p>
      <div class="card-foot"><button class="btn primary big" id="btn-ok">Begrepen <span class="go-ico">${icon('play')}</span></button></div>
    </div>`;
    m.classList.remove('hidden');
    $('btn-ok').addEventListener('click', () => { this.onSound('click'); this.hideModal(); onOk(); });
  }

  private clearChain() { for (const t of this.chainTimers) window.clearTimeout(t); this.chainTimers = []; }
  private chainHtml(c: Chain) {
    const steps = c.steps.map((st, i) => `${i ? `<span class="cs-arrow" data-ar="${i}">${icon('arrow')}</span>` : ''}<div class="cs" data-i="${i}"><div class="cs-av tc ${st.level}"><div class="tc-av">${teamAvatar(st.team)}</div></div><b>${esc(TEAM_INFO[st.team].short)}</b><p>${esc(st.line)}</p></div>`).join('');
    return `<section class="chain" id="chain"><div class="chain-head"><h3>Kettingreactie: ${esc(c.title)}</h3><div class="chain-btns"><button class="btn ghost" id="chain-skip">Overslaan</button><button class="btn ghost" id="chain-replay">Opnieuw</button></div></div><div class="chain-row">${steps}</div></section>`;
  }
  /** teams light up left to right, about 0.9 s per step; skippable, replayable */
  private playChain(c: Chain) {
    this.clearChain();
    const root = document.getElementById('chain'); if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('.cs, .cs-arrow')];
    const lightAll = () => els.forEach((e) => e.classList.add('lit'));
    root.classList.remove('done'); els.forEach((e) => e.classList.remove('lit'));
    if (rm()) { lightAll(); root.classList.add('done'); return; }
    let t = 350;
    for (let i = 0; i < c.steps.length; i++) {
      if (i) { const a = root.querySelector<HTMLElement>(`[data-ar="${i}"]`)!; this.chainTimers.push(window.setTimeout(() => a.classList.add('lit'), t)); t += 300; }
      const s = root.querySelector<HTMLElement>(`.cs[data-i="${i}"]`)!;
      this.chainTimers.push(window.setTimeout(() => { s.classList.add('lit'); this.onSound('click'); }, t)); t += 900;
    }
    this.chainTimers.push(window.setTimeout(() => root.classList.add('done'), t));
  }

  showAfrekening(res: QuarterResult) {
    const m = $('modal'), s = this.s;
    const mo = res.money, last = res.q === QUARTERS - 1;
    const line = (l: string, v: number, cls = '', tip = '') => `<tr class="${cls}"${tip ? ` data-tip="${esc(tip)}"` : ''}><td>${l}</td><td>${fmtM(v)}</td></tr>`;
    const d = res.blijNew - res.blijOld;
    const dcls = d > 0.5 ? 'up' : d < -0.5 ? 'down' : '';
    const causes = causeLines(res, s);
    const reacts = reactions(res);
    const chain = pickChain(res), mh = momentHeadline(res);
    const wrows = res.wijken.map((w) => {
      const cls = w.searchNew < w.searchOld - 0.3 ? 'up' : w.searchNew > w.searchOld + 0.3 ? 'down' : '';
      const sev = w.searchNew > 9 ? 'bad' : w.searchNew > 5 ? 'mid' : 'ok', bw = bezWord(w.bezNew);
      return `<tr><td><i class="dot" style="background:${WIJKEN.find((x) => x.id === w.id)!.color}"></i>${wijkName(w.id)}</td><td>${fmtMin(w.searchOld)}</td><td class="arrow">→</td><td class="${cls}"><span class="sev ${sev}">${fmtMin(w.searchNew)}</span></td><td class="muted ${bw.sev}">${esc(bw.short)}</td></tr>`;
    }).join('');
    const bar = (id: string) => {
      const o = res.personaOld[id], n = res.personaNew[id], dd = n - o;
      return `<div class="pr"><span>${PERSONA_NL[id]}</span><b>${Math.round(o)}</b><i>→</i><b class="${dd > 0.5 ? 'up' : dd < -0.5 ? 'down' : ''}">${Math.round(n)}</b></div>`;
    };
    let dilemma = '';
    if (res.dilemma) {
      const o = TC.dilemma.options[res.dilemma], txt = DILEMMA.options[res.dilemma], voices = DILEMMA.react[res.dilemma];
      const chips = Object.entries(o.persona ?? {}).map(([k, v]) => `<span class="chip ${v > 0 ? 'up' : 'down'}"><i>${v > 0 ? '▲' : '▼'}</i>${PERSONA_NL[k]} ${sgn(v as number)}</span>`).join('');
      const quotes = Object.keys(o.persona ?? {}).slice(0, 2).map((k) => `<p><b>${esc(DILEMMA.voices[k])}</b> “${esc(voices[k] ?? '')}”</p>`).join('');
      dilemma = `<section class="dilres"><h3>Je dilemma: ${esc(txt.label)}</h3><div class="chips">${chips}</div>${quotes}</section>`;
    }
    m.innerHTML = `<div class="card afr" role="dialog" aria-label="Afrekening kwartaal ${res.q + 1}">
      <div class="card-head"><span class="eyebrow">Afrekening</span><h2>Kwartaal ${res.q + 1} van ${QUARTERS}</h2></div>
      ${mh ? `<div class="momentline ${mh.good ? 'good' : 'bad'}"><i>Maasstad Courant</i><b>${esc(mh.title)}</b><span>${esc(mh.sub)}</span></div>` : ''}
      ${chain ? this.chainHtml(chain) : ''}
      <div class="afr-grid">
        <section class="afr-mood">
          <div class="big-score"><span class="lbl">Rotterdammert</span><div class="bs"><b>${Math.round(res.blijOld)}</b><i>→</i><b class="${dcls}">${Math.round(res.blijNew)}</b><span class="bs-d ${dcls}">${d > 0.05 ? '+' : d < -0.05 ? '−' : '±'}${Math.abs(d).toFixed(1).replace('.', ',')}</span></div></div>
          <h3>Waarom?</h3>
          <ol class="causes">${causes.map((c) => `<li class="${c.good ? 'good' : 'bad'}"><span class="c-ico">${icon(c.good ? 'check' : 'warn')}</span><span>${esc(c.text)}</span></li>`).join('') || '<li class="flat"><span>Er is weinig veranderd. Plan het volgende kwartaal iets.</span></li>'}</ol>
          ${dilemma}
          <div class="reacts">${reacts.map((r) => `<div class="react"><div class="r-av ${r.delta >= 0 ? 'up' : 'down'}">${esc(r.who === 'De wethouder' ? 'W' : r.who[0])}</div><div class="r-b"><b>${esc(r.who)}</b><p>“${esc(r.text)}”</p></div></div>`).join('')}</div>
        </section>
        <section class="afr-side">
          <h3>Geld</h3>
          <table class="money">
            <tr class="sec"><td colspan="2">Inkomsten</td></tr>
            ${line('Straatparkeren', mo.revStreet)}${line('Garages', mo.revGarage)}${line('Vergunningen en boetes', mo.revPermit)}
            <tr class="sec"><td colspan="2">Uitgaven</td></tr>
            ${mo.capex ? line('Bouwen en kopen', -mo.capex) : ''}${line('Personeel', -mo.staff)}${line('Beheer en onderhoud', -mo.opex)}${line('Vaste kosten afdeling <small>(gebouwen, systemen, management)</small>', -(mo.overhead + mo.ovCost), 'tip', 'Vaste kosten afdeling|Gebouwen, systemen en management. Dit loopt elk kwartaal door, ook als je niets bouwt.')}
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
    if (chain) {
      $('chain-skip').addEventListener('click', () => { this.clearChain(); document.getElementById('chain')!.querySelectorAll('.cs, .cs-arrow').forEach((e) => e.classList.add('lit')); document.getElementById('chain')!.classList.add('done'); });
      $('chain-replay').addEventListener('click', () => this.playChain(chain));
      this.playChain(chain);
    }
  }

  showEind() {
    const s = this.s, e = s.ending(), h = headline(e, s), L = lessons(s);
    const m = $('modal');
    const st = e.stars;
    const row = (ok: boolean, label: string, val: string) => `<li class="${ok ? 'ok' : 'no'}"><span>${icon(ok ? 'check' : 'close')}</span><b>${label}</b><em>${val}</em></li>`;
    const chaos = e.marathonSearch;
    const lv = s.loads().levels, loads = s.loads().loads;
    const teams = TEAMS.map((t) => `<div class="et ${lv[t]}"><div class="tc-av">${teamAvatar(t)}</div><b>${TEAM_INFO[t].short}</b><small>${levelWord(lv[t])}</small></div>`).join('');
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
          <h3>Je teams aan het eind</h3>
          <div class="eind-teams">${teams}</div>
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
