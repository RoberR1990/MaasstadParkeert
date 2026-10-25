// 3-step guided intro with Ria van Beheer and a spotlight that dims the rest of the screen.
import { Hud } from './hud';
import { RIA_SVG } from './avatar';
import { ToolId } from './structures';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type P = { x: number; y: number } | null;

interface Deps {
  hud: Hud;
  getSearchScreen: () => P;
  getLotScreen: () => P;
  toolSelected: () => ToolId | null;
  onDone: () => void;
  onSound: (k: 'click' | 'chime') => void;
}

const LINES = [
  { text: 'Zie je die auto\'s rondjes rijden? Die zoeken een plek.', btn: 'Volgende' },
  { text: 'Zet een garage neer.', btn: '' },
  { text: 'Maar let op: wie bouwt, moet ook beheren.', btn: 'Begrepen!' },
];

export class Tutorial {
  active = false;
  step = 0;
  private shown = 0;
  private full = '';
  private spot = $('spot');
  private root = $('tutorial');
  private text = $('tut-text');
  private next = $<HTMLButtonElement>('tut-next');
  private targetRect = { x: 0, y: 0, w: 0, h: 0, r: 28 };
  private lockedSearch: P = null;
  private doneTimer = 0;

  constructor(private d: Deps) {
    $('tut-avatar').innerHTML = RIA_SVG;
    $('tut-skip').addEventListener('click', () => { d.onSound('click'); this.finish(); });
    this.next.addEventListener('click', () => { d.onSound('click'); this.advance(); });
  }

  start() {
    this.active = true; this.step = -1;
    this.root.classList.remove('hidden'); this.spot.classList.remove('hidden');
    this.root.style.animation = 'none'; void this.root.offsetWidth; this.root.style.animation = '';
    this.advance();
  }

  private advance() {
    this.step++;
    if (this.step >= LINES.length) { this.finish(); return; }
    this.setText(LINES[this.step].text, LINES[this.step].btn);
    const dots = $('tut-dots').children;
    for (let i = 0; i < dots.length; i++) { dots[i].className = i < this.step ? 'done' : i === this.step ? 'on' : ''; }
    this.d.onSound('chime');
    if (this.step === 1) this.d.hud.hint(null);
    this.lockedSearch = null;
  }

  private setText(t: string, btn: string) {
    this.full = t; this.shown = 0; this.text.textContent = '';
    if (btn) { this.next.style.display = ''; this.next.textContent = btn; }
    else this.next.style.display = 'none';
  }

  /** The player placed something (any tool). */
  notifyPlaced(id: ToolId) {
    if (!this.active || this.step !== 1 || id !== 'garage') return;
    this.d.hud.hint(null);
    window.clearTimeout(this.doneTimer);
    this.doneTimer = window.setTimeout(() => this.advance(), 1700);
  }

  private finish() {
    this.active = false;
    window.clearTimeout(this.doneTimer);
    this.root.classList.add('hidden'); this.spot.classList.add('hidden');
    this.d.hud.hint(null);
    this.d.onDone();
  }

  private setTarget(x: number, y: number, w: number, h: number, r: number) {
    this.targetRect = { x, y, w, h, r };
  }

  update(dt: number) {
    if (!this.active) return;
    // typewriter
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + dt * 48);
      this.text.textContent = this.full.slice(0, Math.floor(this.shown));
    }
    const pad = 10;
    const rectOf = (el: HTMLElement, r = 24) => {
      const b = el.getBoundingClientRect();
      this.setTarget(b.left - pad, b.top - pad, b.width + pad * 2, b.height + pad * 2, r);
    };
    if (this.step === 0) {
      if (!this.lockedSearch) this.lockedSearch = this.d.getSearchScreen();
      const p = this.d.getSearchScreen() ?? this.lockedSearch;
      if (p) this.setTarget(p.x - 95, p.y - 100, 190, 170, 85);
    } else if (this.step === 1) {
      if (this.d.toolSelected() === 'garage') {
        const p = this.d.getLotScreen();
        if (p) this.setTarget(p.x - 80, p.y - 100, 160, 150, 75);
        this.d.hud.hint('Klik op de gloeiende kavel om te bouwen');
      } else {
        rectOf(this.d.hud.toolButton('garage'));
        this.d.hud.hint(null);
      }
    } else if (this.step === 2) {
      const a = $('topleft').getBoundingClientRect();
      this.setTarget(a.left - 8, a.top - 8, a.width + 16, a.height + 16, 30);
    }
    const t = this.targetRect;
    const s = this.spot.style;
    s.left = `${t.x}px`; s.top = `${t.y}px`; s.width = `${t.w}px`; s.height = `${t.h}px`; s.borderRadius = `${t.r}px`;
  }
}
