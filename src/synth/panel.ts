import type { InJack, OutJack, ParamName, WaveName } from './engine';
import { SynthEngine } from './engine';

export type JackId = OutJack | InJack;

interface KnobSpec {
  param: ParamName;
  label: string;
  min: number;
  max: number;
  value: number;
  unit: 'ct' | 'hz' | 'pct' | 'q' | 'ms' | 'bpm';
  big?: boolean;
  log?: boolean;
}

interface Cable {
  from: OutJack;
  to: InJack;
  glow: SVGPathElement;
  line: SVGPathElement;
  hit: SVGPathElement;
  plugA: SVGCircleElement;
  plugB: SVGCircleElement;
}

interface KnobHandle {
  spec: KnobSpec;
  knob: HTMLElement;
}

export interface PatchHooks {
  onStart?: (from: JackId) => void;
  onMove?: (from: JackId, x: number, y: number) => void;
  onEnd?: (from: JackId) => void;
  onCameraDrop?: (from: JackId, x: number, y: number) => boolean;
}

export interface SynthPanelApi {
  updateVu: () => void;
  setPatchHooks: (hooks: PatchHooks) => void;
  cancelPatchDrag: () => void;
  jackClientPoint: (id: JackId) => { x: number; y: number };
}

const PALETTE = ['#d98a3f', '#3f9fd6', '#6f5fc4', '#4faa5f', '#c4553f', '#a4bd55'];

const KNOBS: Record<string, KnobSpec> = {
  tuneA: { param: 'tuneA', label: 'Tune A', min: -1200, max: 1200, value: 0, unit: 'ct' },
  tuneB: { param: 'tuneB', label: 'Tune B', min: -1200, max: 1200, value: 7, unit: 'ct' },
  cutoff: { param: 'cutoff', label: 'Cutoff', min: 120, max: 9000, value: 900, unit: 'hz', big: true, log: true },
  resonance: { param: 'resonance', label: 'Reso', min: 1, max: 18, value: 9, unit: 'q' },
  drive: { param: 'drive', label: 'Drive', min: 0, max: 1, value: 0.25, unit: 'pct' },
  egAttack: { param: 'egAttack', label: 'Attack', min: 0.005, max: 1.5, value: 0.02, unit: 'ms', log: true },
  egDecay: { param: 'egDecay', label: 'Decay', min: 0.02, max: 2, value: 0.22, unit: 'ms', log: true },
  egSustain: { param: 'egSustain', label: 'Sustain', min: 0, max: 1, value: 0.55, unit: 'pct' },
  egRelease: { param: 'egRelease', label: 'Release', min: 0.02, max: 3, value: 0.45, unit: 'ms', log: true },
  vcaLevel: { param: 'vcaLevel', label: 'Level', min: 0, max: 1, value: 0.82, unit: 'pct' },
  mixA: { param: 'mixA', label: 'Ch A', min: 0, max: 1, value: 0.8, unit: 'pct' },
  mixB: { param: 'mixB', label: 'Ch B', min: 0, max: 1, value: 0.7, unit: 'pct' },
  mixC: { param: 'mixC', label: 'Ch C', min: 0, max: 1, value: 0.6, unit: 'pct' },
  level: { param: 'level', label: 'Master', min: 0, max: 1, value: 0.75, unit: 'pct', big: true },
  turingRate: { param: 'turingRate', label: 'Rate', min: 40, max: 240, value: 104, unit: 'bpm' },
  turingWrite: { param: 'turingWrite', label: 'Write', min: 0, max: 1, value: 0.35, unit: 'pct' },
};

const DIRS: Record<JackId, 'out' | 'in'> = {
  'vcoA.out': 'out',
  'vcoB.out': 'out',
  'vcf.out': 'out',
  'vca.out': 'out',
  'mix.out': 'out',
  'master.out': 'out',
  'eg.out': 'out',
  'kbd.pitch': 'out',
  'kbd.gate': 'out',
  'vcf.in': 'in',
  'vcf.cv': 'in',
  'vca.in': 'in',
  'vca.cv': 'in',
  'mix.inA': 'in',
  'mix.inB': 'in',
  'mix.inC': 'in',
  'out.in': 'in',
  'vcoA.cv': 'in',
  'vcoB.cv': 'in',
  'adsr.gate': 'in',
  'turing.cv': 'out',
  'turing.gate': 'out',
};

const WAVE_ICONS: Record<WaveName, string> = {
  sawtooth: '<svg viewBox="0 0 20 14"><path d="M1 12 L9 2 V12 L17 2 V12"/></svg>',
  square: '<svg viewBox="0 0 20 14"><path d="M1 12 V2 h8 v10 h8 V2"/></svg>',
  triangle: '<svg viewBox="0 0 20 14"><path d="M1 12 L5 2 L10 12 L14 2 L18 12"/></svg>',
};

const WAVES: WaveName[] = ['sawtooth', 'square', 'triangle'];
const CUT_HOLD_MS = 560;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_AFTER = [
  { after: 0, offset: 1 },
  { after: 1, offset: 3 },
  { after: 3, offset: 6 },
  { after: 4, offset: 8 },
  { after: 5, offset: 10 },
];
const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};
const SEQ_NOTES = [
  0, 0, 3, 7, 10, 7, 3, 0,
  5, 5, 7, 10, 12, 10, 7, 5,
  0, 3, 5, 7, 10, 12, 15, 12,
  10, 7, 5, 3, 7, 5, 3, 0,
];
const SEQ_GATES = [
  true, false, true, true, false, true, true, false,
  true, false, true, true, false, true, false, true,
  true, false, true, true, false, true, true, false,
  true, true, false, true, false, true, true, false,
];
const SEQ_SCALE = [0, 2, 3, 5, 7, 10, 12, 14, 15, 17, 19, 22, 24];
const SEQ_WIDTH = 32;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tFromValue(spec: KnobSpec): number {
  if (spec.log) return Math.log(spec.value / spec.min) / Math.log(spec.max / spec.min);
  return (spec.value - spec.min) / (spec.max - spec.min);
}

function valueFromT(spec: KnobSpec, t: number): number {
  const clamped = clamp01(t);
  if (spec.log) return spec.min * Math.pow(spec.max / spec.min, clamped);
  return spec.min + (spec.max - spec.min) * clamped;
}

function rotFromT(t: number): number {
  return -135 + t * 270;
}

function formatValue(spec: KnobSpec, value: number): string {
  switch (spec.unit) {
    case 'ct':
      return `${value >= 0 ? '+' : ''}${Math.round(value)} ct`;
    case 'hz':
      return value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${value.toFixed(value < 10 ? 2 : 0)} Hz`;
    case 'pct':
      return `${Math.round(value * 100)}%`;
    case 'q':
      return value.toFixed(1);
    case 'ms':
      return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
    case 'bpm':
      return `${Math.round(value)} BPM`;
  }
}

function tickSvg(cls: string, count = 21): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const angle = ((-135 + (270 * i) / (count - 1)) * Math.PI) / 180;
    const inner = i % 3 === 0 ? 24.2 : 26.6;
    const outer = 30.2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', (32 + Math.cos(angle) * inner).toFixed(2));
    line.setAttribute('y1', (32 + Math.sin(angle) * inner).toFixed(2));
    line.setAttribute('x2', (32 + Math.cos(angle) * outer).toFixed(2));
    line.setAttribute('y2', (32 + Math.sin(angle) * outer).toFixed(2));
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', i % 3 === 0 ? '1.15' : '0.7');
    svg.appendChild(line);
  }
  return svg;
}

export function mountSynth(host: HTMLElement, engine: SynthEngine): SynthPanelApi {
  host.innerHTML = `
    <div class="panel">
      <header class="panel-head">
        <div class="brand-block">
          <div class="panel-brand">ANDREW DOKIN</div>
        </div>
        <div class="head-right">
          <button class="start-btn" data-start type="button" title="Start audio">
            <i></i><span>START</span>
          </button>
          <div class="audio-led" id="audio-led" title="Audio"></div>
        </div>
      </header>
      <div class="panel-body" id="panel-body">
        <svg class="cables" id="cable-layer" aria-hidden="true"></svg>
      </div>
    </div>
  `;

  const body = host.querySelector<HTMLElement>('#panel-body')!;
  const svg = host.querySelector<SVGSVGElement>('#cable-layer')!;
  const led = host.querySelector<HTMLElement>('#audio-led')!;

  /* ── запуск звука ───────────────────────────────────────── */
  let startButtons: HTMLButtonElement[] = [];
  let audioState: HTMLElement | null = null;
  let hintTimer = 0;
  let lastActive: boolean | null = null;
  let lastRunning: boolean | null = null;

  const hintStart = (): void => {
    if (engine.isActive) return;
    window.clearTimeout(hintTimer);
    startButtons.forEach((button) => button.classList.add('nudge'));
    hintTimer = window.setTimeout(() => {
      startButtons.forEach((button) => button.classList.remove('nudge'));
    }, 1100);
  };

  const syncTransport = (): void => {
    const active = engine.isActive;
    const running = engine.running;
    if (active === lastActive && running === lastRunning) return;
    lastActive = active;
    lastRunning = running;
    for (const button of startButtons) {
      button.classList.toggle('on', active);
      const label = button.querySelector('span');
      if (label) label.textContent = active ? 'STOP' : 'START';
      button.title = active ? 'Stop audio' : 'Start audio';
    }
    led.classList.toggle('on', running);
    if (audioState) {
      audioState.textContent = running ? 'AUDIO ONLINE' : active ? 'AUDIO ARMED' : 'AUDIO STANDBY';
    }
  };

  /* ── модули ─────────────────────────────────────────────── */
  let moduleIndex = 0;
  const addModule = (cls: string, title: string): HTMLElement => {
    moduleIndex++;
    const mod = el('div', `module ${cls}`);
    const head = el('div', 'module-head');
    head.append(
      el('span', 'module-index', String(moduleIndex).padStart(2, '0')),
      el('span', 'module-title', title),
      el('span', 'module-rule'),
    );
    const modBody = el('div', 'module-body');
    mod.append(head, modBody);
    body.appendChild(mod);
    return modBody;
  };

  /* ── лупа ───────────────────────────────────────────────── */
  const loupe = el('div', 'loupe');
  loupe.innerHTML = `
    <div class="loupe-glass">
      <div class="loupe-lens"></div>
      <span class="loupe-factor">2.4×</span>
    </div>
    <div class="loupe-arm"></div>
    <div class="loupe-ruler"><i></i></div>
    <div class="loupe-readout"><span class="loupe-label"></span><span class="loupe-value"></span></div>
  `;
  document.body.appendChild(loupe);
  const loupeLens = loupe.querySelector<HTMLElement>('.loupe-lens')!;
  const loupeFactor = loupe.querySelector<HTMLElement>('.loupe-factor')!;
  const loupeRulerMark = loupe.querySelector<HTMLElement>('.loupe-ruler i')!;
  const loupeLabel = loupe.querySelector<HTMLElement>('.loupe-label')!;
  const loupeValue = loupe.querySelector<HTMLElement>('.loupe-value')!;

  let loupeTarget: KnobHandle | null = null;
  let dragKnob: KnobHandle | null = null;
  const knobByWrap = new WeakMap<HTMLElement, KnobHandle>();
  let mouseX = window.innerWidth * 0.5;
  let mouseY = window.innerHeight * 0.5;
  let loupeX = mouseX;
  let loupeY = mouseY;
  let targetX = mouseX;
  let targetY = mouseY;

  const aimLoupe = (): void => {
    const loupeW = loupe.offsetWidth || 208;
    const loupeH = loupe.offsetHeight || 264;
    let x = mouseX + 64;
    if (x + loupeW > window.innerWidth - 8) x = mouseX - loupeW - 32;
    let y = mouseY - loupeH + 46;
    if (y < 8) y = mouseY + 46;
    targetX = Math.max(8, Math.min(window.innerWidth - loupeW - 8, x));
    targetY = Math.max(8, Math.min(window.innerHeight - loupeH - 8, y));
    if (!loupe.classList.contains('on')) {
      loupeX = targetX;
      loupeY = targetY;
    }
  };

  const paintLoupe = (handle: KnobHandle): void => {
    const t = tFromValue(handle.spec);
    const cloneKnob = loupeLens.querySelector<HTMLElement>('.knob');
    cloneKnob?.style.setProperty('--rot', `${rotFromT(t)}deg`);
    loupeRulerMark.style.left = `${t * 100}%`;
    loupeLabel.textContent = handle.spec.label;
    loupeValue.textContent = formatValue(handle.spec, handle.spec.value);
  };

  const showLoupe = (handle: KnobHandle): void => {
    const dial = handle.knob.closest<HTMLElement>('.dial');
    if (dial && loupeTarget !== handle) {
      const clone = dial.cloneNode(true) as HTMLElement;
      clone.classList.add('loupe-clone');
      const size = dial.offsetWidth || 64;
      const lensSide = loupeLens.clientWidth || 148;
      const scale = Math.min(6.4, (lensSide * 0.94) / size);
      clone.style.setProperty('--lens-scale', scale.toFixed(2));
      loupeFactor.textContent = `${scale.toFixed(1)}×`;
      loupeLens.replaceChildren(clone);
    }
    loupeTarget = handle;
    paintLoupe(handle);
    aimLoupe();
    loupe.classList.add('on');
  };

  const hideLoupe = (handle: KnobHandle): void => {
    if (loupeTarget !== handle || dragKnob) return;
    loupeTarget = null;
    loupe.classList.remove('on');
  };

  window.addEventListener('pointermove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (loupeTarget) aimLoupe();
    if (dragKnob) return;
    const wrap = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('knob-wrap'));
    const handle = wrap ? knobByWrap.get(wrap) : null;
    if (handle) {
      if (loupeTarget !== handle) showLoupe(handle);
    } else if (loupeTarget) {
      hideLoupe(loupeTarget);
    }
  });

  let loupeLast = performance.now();
  const loupeFrame = (now: number): void => {
    const dt = Math.min(0.05, (now - loupeLast) / 1000);
    loupeLast = now;
    const k = 1 - Math.exp(-9 * dt);
    loupeX += (targetX - loupeX) * k;
    loupeY += (targetY - loupeY) * k;
    loupe.style.transform = `translate3d(${loupeX.toFixed(1)}px, ${loupeY.toFixed(1)}px, 0)`;
    requestAnimationFrame(loupeFrame);
  };
  requestAnimationFrame(loupeFrame);

  /* ── ручки ──────────────────────────────────────────────── */
  const makeKnob = (key: string): HTMLElement => {
    const spec = KNOBS[key];
    spec.value = engine.params[spec.param];
    const handle: KnobHandle = { spec, knob: el('div', spec.big ? 'knob knob--big' : 'knob') };
    const knob = handle.knob;
    const dial = el('div', spec.big ? 'dial dial--big' : 'dial');
    dial.append(tickSvg('dial-ticks'), knob);
    const wrap = el('div', spec.big ? 'knob-wrap knob-wrap--big' : 'knob-wrap');
    wrap.append(dial, el('div', 'knob-label', spec.label));
    knobByWrap.set(wrap, handle);

    const apply = (t: number): void => {
      const clamped = clamp01(t);
      knob.style.setProperty('--rot', `${rotFromT(clamped)}deg`);
      spec.value = valueFromT(spec, clamped);
      engine.setParam(spec.param, spec.value);
      if (loupeTarget === handle) paintLoupe(handle);
    };

    knob.style.setProperty('--rot', `${rotFromT(tFromValue(spec))}deg`);

    let drag: { startY: number; startT: number } | null = null;
    let encAt = tFromValue(spec);
    let encTime = 0;
    const encoder = (t: number): void => {
      const now = performance.now();
      if (Math.abs(t - encAt) < 0.018 || now - encTime < 45) return;
      encAt = t;
      encTime = now;
      engine.click('dial');
    };

    wrap.addEventListener('pointerenter', () => showLoupe(handle));
    wrap.addEventListener('pointerleave', () => hideLoupe(handle));
    knob.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hintStart();
      engine.click('dial');
      drag = { startY: e.clientY, startT: tFromValue(spec) };
      dragKnob = handle;
      showLoupe(handle);
      try {
        knob.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      e.preventDefault();
    });
    knob.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const range = spec.big ? 210 : 180;
      const next = drag.startT + (drag.startY - e.clientY) / range;
      apply(next);
      encoder(clamp01(next));
    });
    const endDrag = (): void => {
      if (!drag) return;
      drag = null;
      dragKnob = null;
      if (!wrap.matches(':hover')) {
        loupeTarget = null;
        loupe.classList.remove('on');
      }
    };
    knob.addEventListener('pointerup', endDrag);
    knob.addEventListener('pointercancel', endDrag);
    knob.addEventListener('wheel', (e) => {
      e.preventDefault();
      hintStart();
      const step = e.shiftKey ? 0.0025 : 0.012;
      const next = clamp01(tFromValue(spec) + (e.deltaY < 0 ? step : -step));
      apply(next);
      encoder(next);
    }, { passive: false });

    return wrap;
  };

  /* ── фейдеры ────────────────────────────────────────────── */
  const makeFader = (param: 'tone' | 'space', label: string): HTMLElement => {
    const wrap = el('div', 'fader-wrap');
    const track = el('div', 'fader');
    track.append(el('div', 'fader-fill'), el('i', 'fader-thumb'));
    wrap.append(track, el('div', 'fader-label', label));
    let value = engine.params[param];

    const apply = (v: number): void => {
      value = clamp01(v);
      engine.setParam(param, value);
      track.style.setProperty('--v', value.toFixed(3));
      wrap.title = `${label} ${Math.round(value * 100)}%`;
    };

    let drag: { startY: number; startV: number } | null = null;
    let encAt = value;
    let encTime = 0;
    const encoder = (v: number): void => {
      const now = performance.now();
      if (Math.abs(v - encAt) < 0.025 || now - encTime < 45) return;
      encAt = v;
      encTime = now;
      engine.click('dial');
    };
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hintStart();
      engine.click('dial');
      drag = { startY: e.clientY, startV: value };
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      e.preventDefault();
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const next = clamp01(drag.startV + (drag.startY - e.clientY) / 96);
      apply(next);
      encoder(next);
    });
    const end = (): void => {
      drag = null;
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('wheel', (e) => {
      e.preventDefault();
      hintStart();
      const next = clamp01(value + (e.deltaY < 0 ? 0.02 : -0.02));
      apply(next);
      encoder(next);
    }, { passive: false });

    apply(value);
    return wrap;
  };

  /* ── гнёзда ─────────────────────────────────────────────── */
  const jackEls = new Map<JackId, HTMLButtonElement>();

  const makeJack = (id: JackId, label: string): { wrap: HTMLElement; button: HTMLButtonElement } => {
    const wrap = el('div', 'jack-wrap');
    const button = el('button', 'jack');
    button.type = 'button';
    button.dataset.jack = id;
    button.title = `${id} — press and drag`;
    wrap.append(button, el('div', 'jack-label', label));
    jackEls.set(id, button);
    return { wrap, button };
  };

  const jackRow = (items: Array<[JackId, string]>, cls = ''): HTMLElement => {
    const row = el('div', cls ? `jack-row ${cls}` : 'jack-row');
    for (const [id, label] of items) row.appendChild(makeJack(id, label).wrap);
    return row;
  };

  const waveSwitch = (which: 'A' | 'B'): HTMLElement => {
    const wrap = el('div', 'wave-switch');
    for (const wave of WAVES) {
      const b = el('button');
      b.type = 'button';
      b.dataset.wave = wave;
      b.dataset.osc = which;
      b.title = wave;
      b.innerHTML = WAVE_ICONS[wave];
      b.addEventListener('click', () => {
        hintStart();
        engine.setWave(which, wave);
        wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      });
      if (wave === (which === 'A' ? 'sawtooth' : 'square')) b.classList.add('active');
      wrap.appendChild(b);
    }
    return wrap;
  };

  /* 01 — CV / KEYBOARD */
  const keyEls = new Map<number, HTMLButtonElement>();
  let octave = 3;
  let mouseNote: number | null = null;
  const keyboardHeld = new Set<string>();
  const noteNameEl = el('span', 'note-name', 'C3');
  const noteMetaEl = el('span', 'note-meta', 'CV −1.00 V');
  const octValueEl = el('span', 'oct-value', 'OCT 3');
  const midiFor = (offset: number): number => 12 * (octave + 1) + offset;

  const buildKeybed = (): HTMLElement => {
    const bed = el('div', 'keybed');
    for (let i = 0; i < WHITE_OFFSETS.length; i++) {
      const offset = WHITE_OFFSETS[i];
      const key = el('button', 'key key--white');
      key.type = 'button';
      key.dataset.note = String(offset);
      key.style.setProperty('--i', String(i));
      key.appendChild(el('span', 'key-cap', NOTE_NAMES[offset % 12]));
      keyEls.set(offset, key);
      bed.appendChild(key);
    }
    for (const { after, offset } of BLACK_AFTER) {
      const key = el('button', 'key key--black');
      key.type = 'button';
      key.dataset.note = String(offset);
      key.style.setProperty('--i', String(after));
      keyEls.set(offset, key);
      bed.appendChild(key);
    }
    return bed;
  };

  const paintKey = (note: number, on: boolean): void => {
    keyEls.get(note - 12 * (octave + 1))?.classList.toggle('down', on);
  };

  const updateDisplay = (midi: number | null): void => {
    const note = midi ?? 12 * (octave + 1);
    const oct = Math.floor(note / 12) - 1;
    const cv = (note - 60) / 12;
    noteNameEl.textContent = `${NOTE_NAMES[note % 12]}${oct}`;
    noteMetaEl.textContent = `CV ${cv >= 0 ? '+' : '−'}${Math.abs(cv).toFixed(2)} V`;
  };

  const noteOn = (note: number): void => {
    hintStart();
    engine.keyDown(note);
    paintKey(note, true);
    updateDisplay(note);
  };

  const noteOff = (note: number): void => {
    engine.keyUp(note);
    paintKey(note, false);
  };

  const allNotesOff = (): void => {
    if (mouseNote !== null) engine.keyUp(mouseNote);
    mouseNote = null;
    for (const key of keyboardHeld) {
      const offset = KEY_MAP[key];
      if (offset !== undefined) engine.keyUp(midiFor(offset));
    }
    keyboardHeld.clear();
    for (const key of keyEls.values()) key.classList.remove('down');
  };

  const setOctave = (next: number): void => {
    allNotesOff();
    octave = Math.max(1, Math.min(6, next));
    octValueEl.textContent = `OCT ${octave}`;
    updateDisplay(null);
  };

  {
    const mb = addModule('m-cv', 'CV / KEYBOARD');
    const top = el('div', 'cv-top');
    const display = el('div', 'cv-display');
    display.append(noteNameEl, noteMetaEl);
    const octRow = el('div', 'oct-row');
    const octDown = el('button', 'oct-btn', '−');
    octDown.type = 'button';
    octDown.title = 'Octave down';
    const octUp = el('button', 'oct-btn', '+');
    octUp.type = 'button';
    octUp.title = 'Octave up';
    octDown.addEventListener('click', () => setOctave(octave - 1));
    octUp.addEventListener('click', () => setOctave(octave + 1));
    octRow.append(octDown, octValueEl, octUp);
    top.append(display, octRow);
    mb.appendChild(top);

    const bed = buildKeybed();
    bed.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const key = (e.target as Element).closest<HTMLButtonElement>('.key');
      if (!key) return;
      e.preventDefault();
      const offset = Number(key.dataset.note);
      if (Number.isNaN(offset)) return;
      if (mouseNote !== null) noteOff(mouseNote);
      mouseNote = midiFor(offset);
      noteOn(mouseNote);
      try {
        bed.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
    });
    mb.appendChild(bed);

    mb.appendChild(jackRow([
      ['kbd.pitch', 'PITCH'],
      ['kbd.gate', 'GATE'],
    ]));
    mb.appendChild(el('div', 'mod-note mod-note--hint', 'A W S E D F T G Y H U J K'));
  }

  window.addEventListener('pointerup', () => {
    if (mouseNote === null) return;
    noteOff(mouseNote);
    mouseNote = null;
  });
  window.addEventListener('pointercancel', () => {
    if (mouseNote === null) return;
    noteOff(mouseNote);
    mouseNote = null;
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    const offset = KEY_MAP[key];
    if (offset === undefined || keyboardHeld.has(key)) return;
    keyboardHeld.add(key);
    const note = midiFor(offset);
    noteOn(note);
    e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (!keyboardHeld.has(key)) return;
    keyboardHeld.delete(key);
    noteOff(midiFor(KEY_MAP[key]));
  });

  window.addEventListener('blur', () => {
    allNotesOff();
  });

  updateDisplay(null);

  /* 02 — VCO / DUAL */
  {
    const mb = addModule('m-vco', 'VCO / DUAL');
    const pair = el('div', 'vco-pair');
    for (const which of ['A', 'B'] as const) {
      const cell = el('div', 'osc-cell');
      const head = el('div', 'osc-head');
      head.append(el('span', 'osc-id', `OSC ${which}`), waveSwitch(which));
      cell.appendChild(head);
      cell.appendChild(makeKnob(which === 'A' ? 'tuneA' : 'tuneB'));
      cell.appendChild(jackRow([
        [`vco${which}.cv`, 'CV'],
        [`vco${which}.out`, 'OUT'],
      ], 'jack-row--tight'));
      pair.appendChild(cell);
    }
    mb.appendChild(pair);
  }

  /* 03 — VCF / LOWPASS */
  {
    const mb = addModule('m-vcf', 'VCF / LOWPASS');
    const top = el('div', 'vcf-top');
    top.appendChild(makeKnob('cutoff'));
    const side = el('div', 'vcf-side');
    side.append(makeKnob('resonance'), makeKnob('drive'));
    top.appendChild(side);
    mb.appendChild(top);

    const curve = el('div', 'filter-curve');
    curve.innerHTML = `
      <svg viewBox="0 0 200 54" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 14 H200 M0 40 H200" stroke="currentColor" stroke-opacity=".12"/>
        <path d="M0 27 H200" stroke="currentColor" stroke-opacity=".22"/>
        <path d="M2 12 C46 12 72 16 96 18 C122 21 142 40 198 46" fill="none"
          stroke="currentColor" stroke-opacity=".7" stroke-width="1.6"/>
        <circle cx="96" cy="18" r="2.4" fill="currentColor" fill-opacity=".9"/>
      </svg>
    `;
    mb.appendChild(curve);
    mb.appendChild(jackRow([
      ['vcf.in', 'IN'],
      ['vcf.cv', 'CV'],
      ['vcf.out', 'OUT'],
    ]));
  }

  /* 04 — ADSR */
  {
    const mb = addModule('m-adsr', 'ADSR');
    const grid = el('div', 'knob-grid');
    grid.append(
      makeKnob('egAttack'),
      makeKnob('egDecay'),
      makeKnob('egSustain'),
      makeKnob('egRelease'),
    );
    mb.appendChild(grid);

    const gate = el('button', 'gate gate--wide', 'MANUAL GATE');
    gate.type = 'button';
    let manual = false;
    gate.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      hintStart();
      manual = true;
      gate.classList.add('on');
      engine.gate(true);
    });
    const releaseGate = (): void => {
      if (!manual) return;
      manual = false;
      gate.classList.remove('on');
      engine.gate(false);
    };
    window.addEventListener('pointerup', releaseGate);
    window.addEventListener('pointercancel', releaseGate);
    mb.appendChild(gate);
    mb.appendChild(jackRow([
      ['adsr.gate', 'GATE'],
      ['eg.out', 'ENV'],
    ]));
  }

  /* 05 — SEQ / 32 */
  let seqRunning = false;
  let seqTimer = 0;
  {
    const mb = addModule('m-seq', 'SEQ / 32');
    const seqButtons: HTMLButtonElement[] = [];
    const seqNotes = [...SEQ_NOTES];
    const seqGates = [...SEQ_GATES];
    let seqIndex = -1;
    let seqNote: number | null = null;
    let bpm = 104;
    let taps: number[] = [];

    const bar = el('div', 'seq-bar');
    const runBtn = el('button', 'seq-btn seq-btn--run', 'RUN');
    const rndBtn = el('button', 'seq-btn', 'RND');
    const tapBtn = el('button', 'seq-btn', 'TAP');
    const bpmEl = el('span', 'seq-bpm', `${bpm} BPM`);
    for (const b of [runBtn, rndBtn, tapBtn]) b.type = 'button';
    runBtn.title = 'Start / stop 32-step pattern';
    rndBtn.title = 'Randomize pattern and fire a note';
    tapBtn.title = 'Tap tempo';
    bar.append(runBtn, rndBtn, tapBtn, bpmEl);

    const grid = el('div', 'seq-grid seq-grid--32');
    const paintSeq = (): void => {
      seqButtons.forEach((button, i) => {
        button.classList.toggle('on', seqGates[i]);
        button.title = `Step ${i + 1} · +${seqNotes[i]} st`;
      });
    };
    for (let i = 0; i < SEQ_WIDTH; i++) {
      const button = el('button', 'seq-step');
      button.type = 'button';
      button.innerHTML = `<i></i><span>${i + 1}</span>`;
      button.addEventListener('click', () => {
        seqGates[i] = !seqGates[i];
        paintSeq();
        engine.click('button');
        if (seqRunning) {
          seqIndex = -1;
          startTimer();
        }
      });
      seqButtons.push(button);
      grid.appendChild(button);
    }
    paintSeq();

    const releaseSeq = (): void => {
      if (seqNote === null) return;
      paintKey(seqNote, false);
      engine.seqNote(null);
      seqNote = null;
    };

    const seqAdvance = (): void => {
      if (!seqRunning) return;
      if (seqNote !== null) paintKey(seqNote, false);
      seqIndex = (seqIndex + 1) % SEQ_WIDTH;
      seqButtons.forEach((button, i) => button.classList.toggle('now', i === seqIndex));
      if (!seqGates[seqIndex]) {
        engine.seqNote(null);
        seqNote = null;
        return;
      }
      const note = midiFor(seqNotes[seqIndex]);
      seqNote = note;
      engine.seqNote(note);
      paintKey(note, true);
      updateDisplay(note);
    };

    const startTimer = (): void => {
      window.clearInterval(seqTimer);
      seqTimer = window.setInterval(seqAdvance, 30000 / bpm);
    };

    const stopSeq = (): void => {
      if (!seqRunning) return;
      seqRunning = false;
      window.clearInterval(seqTimer);
      seqTimer = 0;
      runBtn.classList.remove('on');
      seqButtons.forEach((button) => button.classList.remove('now'));
      releaseSeq();
    };

    runBtn.addEventListener('click', () => {
      hintStart();
      engine.click('button');
      if (seqRunning) {
        stopSeq();
        return;
      }
      seqRunning = true;
      runBtn.classList.add('on');
      seqIndex = -1;
      seqAdvance();
      startTimer();
    });

    rndBtn.addEventListener('click', () => {
      hintStart();
      engine.click('button');
      for (let i = 0; i < SEQ_WIDTH; i++) {
        seqNotes[i] = SEQ_SCALE[Math.floor(Math.random() * SEQ_SCALE.length)];
        seqGates[i] = Math.random() < 0.62;
      }
      paintSeq();
      if (seqRunning) {
        seqIndex = -1;
        startTimer();
      }
      const offset = [0, 2, 3, 5, 7, 9, 10, 12][Math.floor(Math.random() * 8)];
      const note = engine.rndTrigger(midiFor(offset));
      paintKey(note, true);
      updateDisplay(note);
      window.setTimeout(() => paintKey(note, false), 220);
    });

    tapBtn.addEventListener('click', () => {
      hintStart();
      engine.click('button');
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2200) taps = [];
      taps.push(now);
      if (taps.length > 5) taps.shift();
      if (taps.length < 2) return;
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      bpm = Math.round(Math.min(240, Math.max(50, 60000 / (sum / (taps.length - 1)))));
      bpmEl.textContent = `${bpm} BPM`;
      bpmEl.classList.remove('flash');
      void bpmEl.offsetWidth;
      bpmEl.classList.add('flash');
      if (seqRunning) startTimer();
    });

    mb.append(bar, grid);
  }

  /* 06 — TURING / MACHINE */
  const turingLeds: HTMLElement[] = [];
  let turingValueEl: HTMLElement | null = null;
  {
    const mb = addModule('m-turing', 'TURING / MACHINE');
    const strip = el('div', 'turing-strip');
    for (let i = 0; i < 16; i++) {
      const cell = el('i', 'turing-led');
      strip.appendChild(cell);
      turingLeds.push(cell);
    }
    mb.appendChild(strip);

    const row = el('div', 'turing-body');
    row.append(makeKnob('turingRate'), makeKnob('turingWrite'));

    const side = el('div', 'turing-side');
    const lens = el('div', 'turing-len-row');
    const lenButtons: HTMLButtonElement[] = [];
    for (const len of [4, 8, 16]) {
      const b = el('button', 'turing-len', String(len));
      b.type = 'button';
      b.title = `${len}-step loop`;
      b.classList.toggle('active', len === 16);
      b.addEventListener('click', () => {
        hintStart();
        engine.click('button');
        engine.setTuringLength(len);
        lenButtons.forEach((x) => x.classList.toggle('active', x === b));
      });
      lenButtons.push(b);
      lens.appendChild(b);
    }
    const loop = el('button', 'turing-loop on', 'LOOP');
    loop.type = 'button';
    loop.title = 'Loop register';
    let looping = true;
    loop.addEventListener('click', () => {
      hintStart();
      engine.click('button');
      looping = !looping;
      engine.setTuringLoop(looping);
      loop.classList.toggle('on', looping);
    });
    side.append(lens, loop);

    const readout = el('div', 'turing-readout');
    readout.append(el('span', 'turing-readout-label', 'CV OUT'));
    turingValueEl = el('b', 'turing-readout-value', '0.00');
    readout.appendChild(turingValueEl);
    side.append(readout);

    row.appendChild(side);
    mb.append(row, jackRow([
      ['turing.cv', 'CV'],
      ['turing.gate', 'PULSE'],
    ]));
    mb.appendChild(el('div', 'mod-note', 'SHIFT REGISTER / 8-BIT DAC'));
  }

  /* 07 — VCA / AMP */
  const ampBars = Array.from({ length: 10 }, () => el('i'));
  {
    const mb = addModule('m-vca', 'VCA / AMP');
    const top = el('div', 'vca-top');
    top.appendChild(makeKnob('vcaLevel'));
    const meter = el('div', 'amp-meter');
    for (const bar of ampBars) meter.appendChild(bar);
    top.appendChild(meter);
    mb.appendChild(top);
    mb.appendChild(el('div', 'mod-note', 'GAIN CELL / LINEAR'));
    mb.appendChild(jackRow([
      ['vca.in', 'IN'],
      ['vca.cv', 'CV'],
      ['vca.out', 'OUT'],
    ]));
  }

  /* 06 — SCOPE */
  const scopeCanvas = el('canvas', 'scope scope--big');
  const scopeCtx = scopeCanvas.getContext('2d')!;
  const scopeWave = new Float32Array(1024);
  {
    const mb = addModule('m-scope', 'SCOPE / MONITOR');
    mb.appendChild(scopeCanvas);
    mb.appendChild(el('div', 'mod-note mod-note--center', 'X-Y / 1024 SAMPLE'));
  }

  /* 07 — MIXER / 3 CH */
  {
    const mb = addModule('m-mix', 'MIXER / 3 CH');
    const grid = el('div', 'mix-grid');
    const channels: Array<[string, 'mix.inA' | 'mix.inB' | 'mix.inC', string]> = [
      ['mixA', 'mix.inA', 'A'],
      ['mixB', 'mix.inB', 'B'],
      ['mixC', 'mix.inC', 'C'],
    ];
    for (const [param, jack, label] of channels) {
      const row = el('div', 'mix-row');
      row.append(makeKnob(param), makeJack(jack, `IN ${label}`).wrap);
      grid.appendChild(row);
    }
    mb.appendChild(grid);
    const outRow = el('div', 'mix-out-row');
    outRow.append(el('span', 'mod-note', 'SUM'), makeJack('mix.out', 'OUT').wrap);
    mb.appendChild(outRow);
  }

  /* 08 — AUDIO / OUT */
  {
    const mb = addModule('m-audio', 'AUDIO / OUT');
    const top = el('div', 'audio-top');
    top.appendChild(makeKnob('level'));
    const jacks = el('div', 'jack-col');
    jacks.append(makeJack('out.in', 'IN').wrap, makeJack('master.out', 'SEND').wrap);
    top.appendChild(jacks);
    mb.appendChild(top);

    const faders = el('div', 'fader-row fader-row--audio');
    faders.append(makeFader('tone', 'TONE'), makeFader('space', 'SPACE'));
    mb.appendChild(faders);

    const vu = el('div', 'vu vu--tall');
    for (let i = 0; i < 12; i++) vu.appendChild(el('i'));
    mb.appendChild(vu);

    const transport = el('div', 'transport');
    const start = el('button', 'start-btn start-btn--big');
    start.type = 'button';
    start.dataset.start = '';
    start.title = 'Start audio';
    start.innerHTML = '<i></i><span>START</span>';
    const state = el('div', 'audio-state', 'AUDIO STANDBY');
    state.id = 'audio-state';
    transport.append(start, state);
    mb.appendChild(transport);
  }

  startButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-start]'));
  audioState = host.querySelector<HTMLElement>('#audio-state');
  for (const button of startButtons) {
    button.addEventListener('click', () => {
      if (engine.isActive) engine.stop();
      else engine.start();
      syncTransport();
      window.setTimeout(syncTransport, 340);
    });
  }
  syncTransport();

  /* ── кабели ─────────────────────────────────────────────── */
  const cables: Cable[] = [];
  let colorIndex = 0;
  let activeDrag: {
    from: JackId;
    preview: SVGPathElement;
    glow: SVGPathElement;
    plug: SVGCircleElement;
  } | null = null;
  const hooks: PatchHooks = {};

  const centerOf = (id: JackId): { x: number; y: number } => {
    const jack = jackEls.get(id)!;
    const r = jack.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top };
  };

  const pathFor = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const sag = Math.min(130, 26 + dist * 0.24);
    const c1x = a.x + dx * 0.22;
    const c1y = a.y + sag + Math.max(0, -dy) * 0.12;
    const c2x = b.x - dx * 0.22;
    const c2y = b.y + sag + Math.max(0, dy) * 0.12;
    return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
  };

  const svgEl = <K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] =>
    document.createElementNS('http://www.w3.org/2000/svg', name);

  const drawCable = (cable: Cable): void => {
    const a = centerOf(cable.from);
    const b = centerOf(cable.to);
    const d = pathFor(a, b);
    cable.line.setAttribute('d', d);
    cable.glow.setAttribute('d', d);
    cable.hit.setAttribute('d', d);
    cable.plugA.setAttribute('cx', String(a.x));
    cable.plugA.setAttribute('cy', String(a.y));
    cable.plugB.setAttribute('cx', String(b.x));
    cable.plugB.setAttribute('cy', String(b.y));
  };

  const refreshJacks = (): void => {
    const used = new Set<JackId>();
    for (const c of cables) {
      used.add(c.from);
      used.add(c.to);
    }
    for (const [id, node] of jackEls) node.classList.toggle('connected', used.has(id));
  };

  const removeCable = (cable: Cable): void => {
    engine.disconnect(cable.from, cable.to);
    cable.glow.remove();
    cable.line.remove();
    cable.hit.remove();
    cable.plugA.remove();
    cable.plugB.remove();
    const i = cables.indexOf(cable);
    if (i >= 0) cables.splice(i, 1);
    refreshJacks();
  };

  let cutting: Cable | null = null;
  let cutTimer: number | null = null;

  const stopCut = (): void => {
    if (cutTimer !== null) window.clearTimeout(cutTimer);
    cutTimer = null;
    if (cutting) {
      cutting.line.classList.remove('cutting');
      cutting.glow.classList.remove('cutting');
      cutting = null;
    }
  };

  const startCut = (cable: Cable): void => {
    stopCut();
    cutting = cable;
    cable.line.classList.add('cutting');
    cable.glow.classList.add('cutting');
    cutTimer = window.setTimeout(() => {
      cutTimer = null;
      if (cutting !== cable) return;
      cutting.line.classList.remove('cutting');
      cutting.glow.classList.remove('cutting');
      cutting = null;
      removeCable(cable);
      engine.click('button');
    }, CUT_HOLD_MS);
  };

  const addCable = (from: OutJack, to: InJack): void => {
    if (!engine.connect(from, to)) return;
    const color = PALETTE[colorIndex++ % PALETTE.length];
    const glow = svgEl('path');
    glow.setAttribute('class', 'cable-glow');
    glow.setAttribute('stroke', color);
    const line = svgEl('path');
    line.setAttribute('class', 'cable-line');
    line.setAttribute('stroke', color);
    const hit = svgEl('path');
    hit.setAttribute('class', 'cable-hit');
    hit.setAttribute('pathLength', '100');
    const title = svgEl('title');
    title.textContent = 'Hold to unplug';
    hit.appendChild(title);
    const plugA = svgEl('circle');
    plugA.setAttribute('class', 'plug');
    plugA.setAttribute('r', '6.8');
    const plugB = svgEl('circle');
    plugB.setAttribute('class', 'plug');
    plugB.setAttribute('r', '6.8');

    svg.append(glow, line, hit, plugA, plugB);

    const cable: Cable = { from, to, glow, line, hit, plugA, plugB };
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      startCut(cable);
    });
    cables.push(cable);
    drawCable(cable);
    refreshJacks();
  };

  const pointerPos = (e: PointerEvent): { x: number; y: number } => {
    const br = body.getBoundingClientRect();
    return { x: e.clientX - br.left, y: e.clientY - br.top };
  };

  const drawPreview = (e: PointerEvent): void => {
    if (!activeDrag) return;
    const p = pointerPos(e);
    const a = centerOf(activeDrag.from);
    const d = pathFor(a, p);
    activeDrag.preview.setAttribute('d', d);
    activeDrag.glow.setAttribute('d', d);
    activeDrag.plug.setAttribute('cx', String(p.x));
    activeDrag.plug.setAttribute('cy', String(p.y));
  };

  const onMove = (e: PointerEvent): void => {
    if (!activeDrag) return;
    drawPreview(e);
    hooks.onMove?.(activeDrag.from, e.clientX, e.clientY);
  };

  const endDragVisual = (): void => {
    if (!activeDrag) return;
    activeDrag.preview.remove();
    activeDrag.glow.remove();
    activeDrag.plug.remove();
    activeDrag = null;
  };

  const onUp = (e: PointerEvent): void => {
    if (!activeDrag) return;
    const from = activeDrag.from;
    endDragVisual();

    const handledByCamera = hooks.onCameraDrop?.(from, e.clientX, e.clientY) ?? false;
    hooks.onEnd?.(from);
    if (handledByCamera) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const jackEl = target instanceof Element ? target.closest<HTMLButtonElement>('.jack') : null;
    const toId = jackEl?.dataset.jack as JackId | undefined;
    if (!toId || toId === from) return;
    if (DIRS[from] === DIRS[toId]) return;

    if (DIRS[from] === 'out') addCable(from as OutJack, toId as InJack);
    else addCable(toId as OutJack, from as InJack);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointerup', stopCut);
  window.addEventListener('pointercancel', () => {
    stopCut();
    if (!activeDrag) return;
    const from = activeDrag.from;
    endDragVisual();
    hooks.onEnd?.(from);
  });

  for (const [id, node] of jackEls) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hintStart();
      e.preventDefault();
      const preview = svgEl('path');
      preview.setAttribute('class', 'preview');
      const glow = svgEl('path');
      glow.setAttribute('class', 'preview-glow');
      const plug = svgEl('circle');
      plug.setAttribute('class', 'plug preview-plug');
      plug.setAttribute('r', '6.8');
      const start = centerOf(id);
      const hang = { x: start.x + 6, y: start.y + 46 };
      const d = pathFor(start, hang);
      preview.setAttribute('d', d);
      glow.setAttribute('d', d);
      plug.setAttribute('cx', String(hang.x));
      plug.setAttribute('cy', String(hang.y));
      svg.append(glow, preview, plug);
      activeDrag = { from: id, preview, glow, plug };
      hooks.onStart?.(id);
    });
  }

  const ro = new ResizeObserver(() => {
    for (const c of cables) drawCable(c);
  });
  ro.observe(body);

  /* базовый генеративный патч: Turing сам триггерит конверт и двигает тембр */
  addCable('kbd.pitch', 'vcoA.cv');
  addCable('kbd.pitch', 'vcoB.cv');
  addCable('kbd.gate', 'adsr.gate');
  addCable('turing.gate', 'adsr.gate');
  addCable('turing.cv', 'vcf.cv');
  addCable('turing.cv', 'vcoB.cv');
  addCable('vcoA.out', 'vcf.in');
  addCable('vcoB.out', 'vcf.in');
  addCable('eg.out', 'vca.cv');
  addCable('vcf.out', 'vca.in');
  addCable('vca.out', 'mix.inA');
  addCable('mix.out', 'out.in');

  /* ── монитор и VU ───────────────────────────────────────── */
  const bars = Array.from(host.querySelectorAll<HTMLElement>('.m-audio .vu i'));
  let scopeW = 0;
  let scopeH = 0;

  const drawScope = (): void => {
    const rect = scopeCanvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w !== scopeW || h !== scopeH) {
      scopeW = w;
      scopeH = h;
      scopeCanvas.width = w;
      scopeCanvas.height = h;
    }

    const ctx = scopeCtx;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.43;
    const unit = dpr;

    ctx.strokeStyle = 'rgba(234, 228, 207, 0.22)';
    ctx.lineWidth = unit;
    for (const k of [0.42, 0.72, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(234, 228, 207, 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(234, 228, 207, 0.42)';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const inner = r * (i % 3 === 0 ? 0.93 : 0.96);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }

    if (!engine.getWaveform(scopeWave)) scopeWave.fill(0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(99, 255, 160, 0.9)';
    ctx.lineWidth = 1.6 * unit;
    ctx.beginPath();
    const span = 2 * r * 0.9;
    for (let i = 0; i < scopeWave.length; i++) {
      const x = cx - span / 2 + (i / (scopeWave.length - 1)) * span;
      const y = cy + Math.max(-1, Math.min(1, scopeWave[i] * 2.4)) * r * 0.72;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(234, 228, 207, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 1.02, 2 * unit, 0, Math.PI * 2);
    ctx.fill();
  };

  return {
    updateVu: () => {
      syncTransport();
      const running = engine.running;
      const level = running ? engine.getLevel() : 0;
      bars.forEach((bar, i) => {
        const v = running ? Math.min(1, Math.max(0.05, level * 16 - i * 0.55)) : 0.04;
        bar.style.setProperty('--v', v.toFixed(2));
      });
      ampBars.forEach((bar, i) => {
        const on = running && level * 18 > i * 0.9;
        bar.classList.toggle('on', on);
      });
      const turing = engine.getTuringState();
      turingLeds.forEach((cell, i) => {
        const inLoop = i < turing.length;
        cell.classList.toggle('in-loop', inLoop);
        cell.classList.toggle('on', inLoop && turing.bits[i] === 1);
        cell.classList.toggle('head', i === turing.index);
      });
      if (turingValueEl) turingValueEl.textContent = turing.value.toFixed(2);
      drawScope();
    },
    setPatchHooks: (next: PatchHooks) => {
      Object.assign(hooks, next);
    },
    cancelPatchDrag: () => {
      if (!activeDrag) return;
      const from = activeDrag.from;
      endDragVisual();
      hooks.onEnd?.(from);
    },
    jackClientPoint: (id: JackId) => {
      const r = jackEls.get(id)!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
  };
}
