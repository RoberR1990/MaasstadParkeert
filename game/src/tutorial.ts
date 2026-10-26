// 4-step guided intro with Ria van Beheer: instant text, a spotlight, and a card that never covers its own target.
import { RIA_SVG } from './avatar';
import { GOAL } from './session';
import type { PlanItem } from './session';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
interface Rect { x: number; y: number; w: number; h: number; r: number }

interface Deps {
  /** screen position of the Centrum wijk (diorama) */
  centrumScreen: () => { x: number; y: number } | null;
  /** screen position of a free Centrum bouwplek (while the garage tool is selected) */
  lotScreen: () => { x: number; y: number } | null;
  selectedTool: () => string | null;
  centrumMin: () => number;
  onDone: () => void;
  onSound: (k: 'click' | 'chime') => void;
}

export class Tutorial {
  active = false;
  step = -1;
  private spot = $('spot');
  private root = $('tutorial');
  private text = $('tut-text');
  private next = $<HTMLButtonElement>('tut-next');
  private arrow = $('tut-arrow');
  private target: Rect = { x: 0, y: 0, w: 0, h: 0, r: 28 };
  private lastKey = '';

  constructor(private d: Deps) {
    $('tut-avatar').innerHTML = RIA_SVG;
    $('tut-skip').addEventListener('click', () => { d.onSound('click'); this.finish(); });
    this.next.addEventListener('click', () => { d.onSound('click'); this.advance(); });
  }

  private lines() {
    const m = Math.round(this.d.centrumMin());
    return [
      { text: `Dit is jouw probleem: Centrum staat rood. Auto’s zoeken hier gemiddeld ${m} minuten naar een plek. Daar wordt de Rotterdammert chagrijnig van.`, btn: 'Volgende' },
      { text: `Dit is je doel. Eindig na vier kwartalen met Rotterdammert ${GOAL.blijMin} of hoger, een fonds boven nul, en een Marathon waar Centrum niet vastloopt.`, btn: 'Volgende' },
      { text: 'Plan je eerste kwartaal: bouw een garage óf een scanauto in Centrum. Kies hieronder een bouwmiddel en tik op een gloeiende bouwplek.', btn: '' },
      { text: 'Mooi. Druk nu op Volgend kwartaal om te zien wat er gebeurt.', btn: '' },
    ];
  }

  start() {
    this.active = true; this.step = -1;
    document.body.classList.add('tutorial-on');
    this.root.classList.remove('hidden'); this.spot.classList.remove('hidden');
    this.advance();
  }

  private advance() {
    this.step++;
    if (this.step >= 4) { this.finish(); return; }
    const L = this.lines()[this.step];
    this.text.textContent = L.text;
    this.next.style.display = L.btn ? '' : 'none';
    if (L.btn) this.next.textContent = L.btn;
    const dots = $('tut-dots').children;
    for (let i = 0; i < dots.length; i++) dots[i].className = i < this.step ? 'done' : i === this.step ? 'on' : '';
    this.d.onSound('chime');
    this.lastKey = '';
  }

  /** player planned something */
  notifyPlanned(i: PlanItem) {
    if (!this.active || this.step !== 2) return;
    if ((i.kind === 'garage' || i.kind === 'scanauto') && i.wijk === 'centrum') window.setTimeout(() => { if (this.active && this.step === 2) this.advance(); }, 500);
  }
  notifyCommit() { if (this.active && this.step === 3) this.finish(); }

  private finish() {
    this.active = false;
    document.body.classList.remove('tutorial-on');
    this.root.classList.add('hidden'); this.spot.classList.add('hidden'); this.arrow.classList.add('hidden');
    this.d.onDone();
  }

  private rectOf(el: HTMLElement | null, pad = 10, r = 22): Rect | null {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    return { x: b.left - pad, y: b.top - pad, w: b.width + pad * 2, h: b.height + pad * 2, r };
  }

  update() {
    if (!this.active) return;
    const W = window.innerWidth, H = window.innerHeight;
    let t: Rect | null = null;
    if (this.step === 0) {
      const p = this.d.centrumScreen();
      if (p) { const rr = Math.min(W, H) * 0.14; t = { x: p.x - rr * 1.5, y: p.y - rr, w: rr * 3, h: rr * 2, r: rr }; }
    } else if (this.step === 1) t = this.rectOf($('goalbar'), 8, 26);
    else if (this.step === 2) {
      const tool = this.d.selectedTool();
      if (tool === 'garage') { const p = this.d.lotScreen(); if (p) t = { x: p.x - 70, y: p.y - 70, w: 140, h: 140, r: 70 }; }
      else if (tool === 'scanauto') { const p = this.d.centrumScreen(); if (p) t = { x: p.x - 90, y: p.y - 60, w: 180, h: 120, r: 60 }; }
      if (!t) t = this.rectOf(document.querySelector<HTMLElement>('.tool[data-tool="garage"]'), 8, 22);
    } else if (this.step === 3) t = this.rectOf($('btn-next'), 8, 28);
    if (t) this.target = t;
    const s = this.spot.style, T = this.target;
    s.left = `${T.x}px`; s.top = `${T.y}px`; s.width = `${T.w}px`; s.height = `${T.h}px`; s.borderRadius = `${T.r}px`;

    // card: bottom (above the build bar) unless it would cover the target (or the hint bar), then top (below the HUD)
    const card = this.root, key = `${this.step}|${W}|${H}|${Math.round(T.x)}|${Math.round(T.y)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const phone = W < 700;
      const ch = card.offsetHeight || 170, cw = card.offsetWidth || 360;
      const bottomY = H - (phone ? 176 : 168) - ch, topY = phone ? 112 : 96;
      const left = (W - cw) / 2;
      const hits = (y: number) => !(T.y > y + ch + 14 || T.y + T.h < y - 14 || T.x > left + cw + 14 || T.x + T.w < left - 14);
      const hint = $('hint');
      const hr = hint.classList.contains('hidden') ? null : hint.getBoundingClientRect();
      const hitsHint = (y: number) => !!hr && !(hr.top > y + ch || hr.bottom < y);
      const useTop = hits(bottomY) || hitsHint(bottomY);
      card.style.top = `${useTop ? topY : bottomY}px`; card.style.bottom = 'auto';
      card.dataset.pos = useTop ? 'top' : 'bottom';
    }
    // bouncing arrow next to the target
    const a = this.arrow;
    if (this.step >= 2 && !this.active) a.classList.add('hidden');
    else if (this.step >= 2) {
      a.classList.remove('hidden');
      const side = T.x + T.w < 420 && T.y > H * 0.6; // target hugs the left edge (plan button): point at it from the right
      const above = T.y > 120;
      a.classList.toggle('side', side);
      if (side) { a.style.left = `${T.x + T.w + 22}px`; a.style.top = `${T.y + T.h / 2 - 15}px`; a.classList.remove('flip'); }
      else { a.style.left = `${T.x + T.w / 2}px`; a.style.top = `${above ? T.y - 34 : T.y + T.h + 4}px`; a.classList.toggle('flip', !above); }
    } else a.classList.add('hidden');
  }
}
