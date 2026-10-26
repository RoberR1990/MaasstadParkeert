// Reusable character card: a flat avatar with a speech card. Used for Ria (tutorial) and Sap (adviser).
export interface CardSpec { name: string; role: string; svg: string; text: string; ms?: number; id?: string }

export class CharCard {
  private layer: HTMLElement;
  private shown = new Set<string>();
  constructor(layerId = 'cardlayer', private onSound: (k: 'click' | 'chime') => void = () => {}) {
    this.layer = document.getElementById(layerId)!;
  }
  /** show a card once per id */
  show(c: CardSpec) {
    if (c.id) { if (this.shown.has(c.id)) return; this.shown.add(c.id); }
    const el = document.createElement('div');
    el.className = 'charcard';
    el.innerHTML = `<div class="cc-av">${c.svg}</div><div class="cc-body panel"><div class="cc-name"><b>${c.name}</b><span>${c.role}</span></div><p></p></div>`;
    el.querySelector('p')!.textContent = c.text;
    this.layer.appendChild(el);
    this.onSound('chime');
    const close = () => { el.classList.add('out'); window.setTimeout(() => el.remove(), 500); };
    el.addEventListener('click', close);
    window.setTimeout(close, c.ms ?? 7500);
    return el;
  }
}
