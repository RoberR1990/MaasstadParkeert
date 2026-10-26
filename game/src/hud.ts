// HTML/CSS overlay: fonds, kwartaal, Rotterdammert centraal (SVG character), meters, toolbar, events, tooltips, floating text.
import { icon } from './icons';
import { ROTTERDAMMERT_SVG } from './avatar';
import { TOOLS, ToolId } from './structures';
import { clamp, damp, lerp } from './util';
import { fmtM, moodSet, moodWord } from './copy';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const PERSONAS = [
  { id: 'bewoner', name: 'Bewoner', ico: 'home', tip: 'Wil een plek bij de deur. Zoektijd en vergunningen tellen.' },
  { id: 'ondernemer', name: 'Ondernemer', ico: 'shop', tip: 'Klanten moeten de winkel kunnen bereiken. Geen plek = geen omzet.' },
  { id: 'bezoeker', name: 'Bezoeker', ico: 'pin', tip: 'Zoekt kort, betaalt makkelijk en rijdt blij weer weg.' },
  { id: 'fietser', name: 'Fietser', ico: 'fiets', tip: 'Wil veilig en droog stallen. Zonder stalling staat de fiets overal.' },
  { id: 'stad', name: 'Stad', ico: 'city', tip: 'Leefbaarheid: minder auto\'s op straat, meer ruimte voor groen.' },
  { id: 'wethouder', name: 'Wethouder', ico: 'hall', tip: 'Kijkt naar de begroting en naar de krantenkoppen.' },
] as const;
export type PersonaId = (typeof PERSONAS)[number]['id'];

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
};
const mix3 = (a: string, b: string, c: string, t: number) => (t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2));

export class Hud {
  onTool: (id: ToolId | null) => void = () => {};
  onClock: () => void = () => {};
  onRain: () => void = () => {};
  onMute: () => void = () => {};
  onSound: (kind: 'click' | 'tick' | 'slider', v?: number) => void = () => {};
  onEvent: (id: 'wedstrijd' | 'gorilla' | null) => void = () => {};
  onLabels: () => void = () => {};
  private sayCat: string[] | null = null; private sayT = 0; private sayLast = '';
  private eventOn = false;

  private fondsShown = 0;
  private fondsAnim: number | null = null;
  private moodNow = 0;
  private moodTarget = 0;
  private happyNow = 70; private shownHappy = 70;
  private personaEls = new Map<string, { bar: HTMLElement; val: number; cur: number }>();
  private toolEls = new Map<ToolId, HTMLButtonElement>();
  private tip = $('tooltip');
  private lookX = 0; private lookY = 0;
  private blink = 0;
  private t = 0;
  fondsEl = $('fonds');

  constructor() {
    $('fonds-coin').innerHTML = icon('coin');
    $('title-badge').textContent = 'P';
    $('play-ico').innerHTML = icon('play');
    $('btn-rain').innerHTML = icon('rain');
    $('btn-mute').innerHTML = icon('volume');
    $('clock-pp').innerHTML = icon('pause');
    $('clock-ico').innerHTML = icon('sun');
    $('face-wrap').innerHTML = ROTTERDAMMERT_SVG;
    $('btn-event').innerHTML = icon('flag');
    $('btn-labels').innerHTML = icon('tag');
    $('banner-x').innerHTML = icon('close');
    $('ev-ico1').innerHTML = icon('city');
    $('ev-ico2').innerHTML = icon('search');
    $('face-wrap').addEventListener('click', () => { if (matchMedia('(max-width: 700px)').matches) { $('topright').classList.toggle('open'); this.onSound('click'); } });
    $('btn-labels').addEventListener('click', () => { this.onSound('click'); this.onLabels(); });
    $('btn-event').addEventListener('click', () => {
      this.onSound('click');
      if (this.eventOn) { this.onEvent(null); return; }
      $('event-menu').classList.toggle('hidden');
    });
    for (const b of document.querySelectorAll<HTMLElement>('.ev')) b.addEventListener('click', () => { this.onSound('click'); $('event-menu').classList.add('hidden'); this.onEvent(b.dataset.ev as 'wedstrijd' | 'gorilla'); });
    $('banner-x').addEventListener('click', () => { this.onSound('click'); this.onEvent(null); });

    // meters
    const m = $('meters');
    for (const p of PERSONAS) {
      const d = document.createElement('div');
      d.className = 'meter';
      d.dataset.tip = `${p.name}|${p.tip}`;
      d.innerHTML = `<div class="mrow">${icon(p.ico)}<span>${p.name}</span></div><div class="bar"><i></i></div>`;
      m.appendChild(d);
      this.personaEls.set(p.id, { bar: d.querySelector('i') as HTMLElement, val: 60, cur: 60 });
    }

    // toolbar
    const tb = $('toolbar');
    for (const t of Object.values(TOOLS)) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.dataset.tip = `${t.label}|${t.blurb}`;
      b.setAttribute('aria-label', t.label);
      b.innerHTML = `<span class="t-key">${t.key}</span><span class="t-ico">${icon(t.id)}</span><span class="t-name"><span class="long">${t.label}</span><span class="short">${t.short}</span></span><span class="t-cost">${icon('coin')}${t.costLabel}</span>`;
      b.addEventListener('click', () => { this.onSound('click'); this.onTool(b.classList.contains('selected') ? null : t.id); });
      b.addEventListener('pointerenter', () => this.onSound('tick'));
      tb.appendChild(b);
      this.toolEls.set(t.id, b);
    }

    $('clock').addEventListener('click', () => { this.onSound('click'); this.onClock(); });
    $('btn-rain').addEventListener('click', () => { this.onSound('click'); this.onRain(); });
    $('btn-mute').addEventListener('click', () => { this.onMute(); this.onSound('click'); });
    for (const el of document.querySelectorAll('.panel.round, .pill.clock')) el.addEventListener('pointerenter', () => this.onSound('tick'));

    // tooltips: hover on desktop, long-press (0.45 s) on touch
    const showTip = (el: HTMLElement) => {
      if (document.body.classList.contains('tutorial-on')) return;
      const [title, text] = (el.dataset.tip ?? '').split('|');
      (this.tip.querySelector('b') as HTMLElement).textContent = title;
      (this.tip.querySelector('span') as HTMLElement).textContent = text ?? '';
      const r = el.getBoundingClientRect();
      this.tip.classList.add('show');
      const tw = this.tip.offsetWidth;
      const x = clamp(r.left + r.width / 2, tw / 2 + 8, window.innerWidth - tw / 2 - 8);
      const hintUp = el.closest('.toolbar') && !$('hint').classList.contains('hidden') ? 56 : 0;
      const above = r.top > 190;
      this.tip.style.left = `${x}px`;
      this.tip.style.top = above ? `${r.top - this.tip.offsetHeight - 12 - hintUp}px` : `${r.bottom + 12}px`;
    };
    let lp = 0;
    document.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      if (el) showTip(el);
    });
    document.addEventListener('pointerout', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      if ((e.target as HTMLElement).closest?.('[data-tip]')) this.tip.classList.remove('show');
    });
    document.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).pointerType !== 'touch') return;
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      window.clearTimeout(lp);
      if (el) lp = window.setTimeout(() => { showTip(el); window.setTimeout(() => this.tip.classList.remove('show'), 2600); }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointermove'] as const) document.addEventListener(ev, (e) => { if (ev !== 'pointermove' || (e as PointerEvent).pointerType === 'touch') window.clearTimeout(lp); });
    this.setFunds(0, false);
  }

  fmtFunds(v: number) { return fmtM(v); }

  setFunds(v: number, animate = true) {
    const from = this.fondsShown;
    this.fondsShown = v;
    const el = this.fondsEl;
    if (!animate || Math.abs(from - v) < 1e-6) { el.textContent = this.fmtFunds(v); return; }
    el.classList.remove('flash-neg', 'flash-pos'); void el.offsetWidth;
    el.classList.add(v < from ? 'flash-neg' : 'flash-pos');
    $('fonds-coin').classList.remove('bump'); void $('fonds-coin').offsetWidth; $('fonds-coin').classList.add('bump');
    if (this.fondsAnim) cancelAnimationFrame(this.fondsAnim);
    const t0 = performance.now(), dur = 900;
    const step = (now: number) => {
      const k = clamp((now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = this.fmtFunds(lerp(from, v, e));
      if (k < 1) this.fondsAnim = requestAnimationFrame(step); else this.fondsAnim = null;
    };
    this.fondsAnim = requestAnimationFrame(step);
  }

  setDelta(text: string, pos = false) {
    const d = $('fonds-delta');
    d.textContent = text;
    d.classList.toggle('pos', pos); d.classList.toggle('neg', !pos);
    d.classList.add('show');
    window.setTimeout(() => d.classList.remove('show'), 3500);
  }

  setQuarter(q: number, total: number, label: string, sub: string) {
    $('qnum').textContent = String(Math.min(q + 1, total));
    $('kwartaal').textContent = sub;
    $('kwartaal-lbl').textContent = label;
    $('qfg').style.strokeDashoffset = String(100 - (q / total) * 100);
  }

  setPersonas(v: Record<PersonaId, number>, overall: number) {
    for (const p of PERSONAS) this.personaEls.get(p.id)!.val = v[p.id];
    this.moodTarget = clamp(1 - overall / 100);
    this.happyNow = overall;
  }

  setClock(hour: number, paused: boolean, night: number) {
    const h = ((hour % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 5) * 5;
    $('clock-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const ico = night > 0.5 ? 'moon' : 'sun';
    const ci = $('clock-ico');
    if (ci.dataset.i !== ico) { ci.innerHTML = icon(ico); ci.dataset.i = ico; }
    ci.style.color = night > 0.5 ? '#7c93d6' : hour > 16.5 && hour < 19.5 ? '#ee8a4c' : '#f0b640';
    const pp = $('clock-pp');
    const k = paused ? 'play' : 'pause';
    if (pp.dataset.i !== k) { pp.innerHTML = icon(k); pp.dataset.i = k; }
  }

  setLabels(on: boolean) { $('btn-labels').classList.toggle('on', on); }
  setEventActive(on: boolean) {
    this.eventOn = on;
    $('btn-event').classList.toggle('live', on);
    $('btn-event').innerHTML = icon(on ? 'close' : 'flag');
    if (on) $('event-menu').classList.add('hidden');
  }
  banner(title: string, sub: string, alert = false) {
    const b = $('banner');
    b.classList.remove('hidden'); b.classList.toggle('alert', alert);
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    $('banner-title').textContent = title; $('banner-sub').textContent = sub; $('banner-count').textContent = '';
  }
  bannerCount(t: string) { $('banner-count').textContent = t; }
  bannerSub(t: string) { $('banner-sub').textContent = t; }
  clearBanner() { $('banner').classList.add('hidden'); }
  toast(text: string, small = '', ms = 5200) {
    const el = $('toast');
    el.innerHTML = `${text}${small ? `<small>${small}</small>` : ''}`;
    el.classList.remove('hidden', 'out');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    window.setTimeout(() => el.classList.add('out'), ms);
    window.setTimeout(() => el.classList.add('hidden'), ms + 900);
  }
  setRain(on: boolean) { $('btn-rain').classList.toggle('on', on); }
  setMute(m: boolean) { $('btn-mute').innerHTML = icon(m ? 'mute' : 'volume'); $('btn-mute').classList.toggle('off', m); }

  selectTool(id: ToolId | null) {
    for (const [k, el] of this.toolEls) el.classList.toggle('selected', k === id);
  }
  setAffordable(funds: number) {
    for (const [k, el] of this.toolEls) el.classList.toggle('disabled', TOOLS[k].cost > funds);
  }
  /** brief message in the hint bar (explains an invalid tap) */
  warn(text: string) {
    const h = $('hint');
    $('hint-text').textContent = text; h.classList.remove('hidden'); h.classList.add('warn');
    window.clearTimeout(this.warnT);
    this.warnT = window.setTimeout(() => { h.classList.remove('warn'); this.onHintExpire(); }, 3200);
  }
  onHintExpire: () => void = () => {};
  private warnT = 0;
  shakeTool(id: ToolId) {
    const el = this.toolEls.get(id)!;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }
  toolButton(id: ToolId) { return this.toolEls.get(id)!; }

  hint(text: string | null, cancel = false) {
    const h = $('hint');
    if (!text) { h.classList.add('hidden'); return; }
    $('hint-text').textContent = text; h.classList.remove('hidden'); h.classList.toggle('has-cancel', cancel);
  }

  floater(x: number, y: number, text: string, cls = 'neg', withCoin = true) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.innerHTML = (withCoin ? `<span style="display:grid;font-size:26px">${icon('coin')}</span>` : '') + `<span>${text}</span>`;
    $('floaters').appendChild(el);
    window.setTimeout(() => el.remove(), 2000);
  }

  /** Per-frame: smooth the face and meters. */
  update(dt: number, lookX: number, lookY: number) {
    this.t += dt;
    this.moodNow = damp(this.moodNow, this.moodTarget, 3.0, dt);
    const m = this.moodNow;
    for (const e of this.personaEls.values()) {
      e.cur = damp(e.cur, e.val, 3, dt);
      e.bar.style.width = `${clamp(e.cur, 3, 100)}%`;
      e.bar.style.background = mix3('#e2735a', '#f0c24a', '#00811f', clamp(e.cur / 100));
    }
    this.shownHappy = damp(this.shownHappy, this.happyNow, 3.0, dt);
    const happy = this.shownHappy;
    $('mood-num').textContent = String(Math.round(happy));
    $('mood-word').textContent = moodWord(happy);
    this.sayT -= dt;
    const set = moodSet(happy);
    if (set !== this.sayCat) { this.sayCat = set; this.sayT = 0; }
    if (this.sayT <= 0) {
      this.sayT = 6.5;
      let line = set[Math.floor(Math.random() * set.length)];
      if (line === this.sayLast) line = set[(set.indexOf(line) + 1) % set.length];
      if (line !== this.sayLast) { this.sayLast = line; $('say-text').textContent = line; const sy = $('say'); sy.classList.remove('swap'); void sy.offsetWidth; sy.classList.add('swap'); }
    }
    this.drawFace(m, dt, lookX, lookY);
  }

  private drawFace(m: number, dt: number, lookX: number, lookY: number) {
    const set = (id: string, attrs: Record<string, string | number>) => {
      const el = document.getElementById(id);
      if (el) for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    };
    set('ring', { stroke: mix3('#00811f', '#f0c24a', '#e2735a', m), 'stroke-dasharray': `${clamp(this.happyNow, 2, 100)} 100` });
    set('rcBg', { fill: mix3('#cfe6d6', '#f1e3c4', '#f3cfc2', m) });
    // mouth: smile -> flat -> frown
    const yEnd = lerp(63, 71, m), yCtl = lerp(76, 57, m), x0 = lerp(40.5, 42, m), x1 = 100 - x0;
    const d = `M${x0} ${yEnd} Q50 ${yCtl} ${x1} ${yEnd}`;
    set('mouth', { d });
    set('mouthFill', { d: `${d} Z`, opacity: clamp(1 - m / 0.4) * 0.95 });
    // brows
    const mm2 = Math.pow(m, 1.7);
    const bo = lerp(41.2, 38.5, mm2), bi = lerp(40.4, 45, mm2);
    set('browL', { x1: 32.5, y1: bo, x2: 46.5, y2: bi });
    set('browR', { x1: 67.5, y1: bo, x2: 53.5, y2: bi });
    // eyes + lids
    const lid = lerp(0, 6, clamp((m - 0.4) / 0.6));
    this.blink -= dt;
    if (this.blink < -3.6 + Math.sin(this.t) * 0.5) this.blink = 0.12;
    const L = Math.max(lid, this.blink > 0 ? 13 : 0);
    set('lidL', { height: L, transform: `rotate(${lerp(0, 14, m)} 40 50)` });
    set('lidR', { height: L, transform: `rotate(${-lerp(0, 14, m)} 60 50)` });
    const px = clamp(lookX, -1, 1) * 1.8, py = clamp(lookY, -1, 1) * 1.4;
    set('pupL', { cx: 40.6 + px, cy: 50.6 + py + m * 1.2, r: lerp(3.2, 2.8, m) });
    set('pupR', { cx: 59.4 + px, cy: 50.6 + py + m * 1.2, r: lerp(3.2, 2.8, m) });
    set('cheekL', { opacity: lerp(0.6, 0.12, m) });
    set('cheekR', { opacity: lerp(0.6, 0.12, m) });
    set('sweat', { opacity: clamp((m - 0.38) * 4) * (1 - clamp((m - 0.75) * 4)) * 0.95 });
    set('steam', { opacity: clamp((m - 0.78) * 5) * (0.6 + 0.4 * Math.sin(this.t * 6)) });
    const face = document.getElementById('face')!;
    face.classList.toggle('shake', m > 0.82);
    face.classList.toggle('bounce', m <= 0.82);
  }
}

