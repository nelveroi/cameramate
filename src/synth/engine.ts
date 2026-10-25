export type ParamName =
  | 'tuneA'
  | 'tuneB'
  | 'cutoff'
  | 'resonance'
  | 'level'
  | 'vcaLevel'
  | 'mixA'
  | 'mixB'
  | 'mixC'
  | 'egAttack'
  | 'egDecay'
  | 'egSustain'
  | 'egRelease'
  | 'drive'
  | 'tone'
  | 'space'
  | 'turingRate'
  | 'turingWrite';
export type WaveName = 'sawtooth' | 'square' | 'triangle';
export type OutJack =
  | 'vcoA.out'
  | 'vcoB.out'
  | 'vcf.out'
  | 'vca.out'
  | 'mix.out'
  | 'master.out'
  | 'eg.out'
  | 'kbd.pitch'
  | 'kbd.gate'
  | 'turing.cv'
  | 'turing.gate';
export type InJack =
  | 'vcf.in'
  | 'vcf.cv'
  | 'vca.in'
  | 'vca.cv'
  | 'mix.inA'
  | 'mix.inB'
  | 'mix.inC'
  | 'out.in'
  | 'vcoA.cv'
  | 'vcoB.cv'
  | 'adsr.gate';
type AudioIn = 'vcf.in' | 'vca.in' | 'mix.inA' | 'mix.inB' | 'mix.inC' | 'out.in';

export interface SynthParams {
  tuneA: number;
  tuneB: number;
  cutoff: number;
  resonance: number;
  level: number;
  vcaLevel: number;
  mixA: number;
  mixB: number;
  mixC: number;
  egAttack: number;
  egDecay: number;
  egSustain: number;
  egRelease: number;
  drive: number;
  tone: number;
  space: number;
  turingRate: number;
  turingWrite: number;
}

const OUT_JACKS: OutJack[] = [
  'vcoA.out',
  'vcoB.out',
  'vcf.out',
  'vca.out',
  'mix.out',
  'master.out',
  'eg.out',
  'kbd.pitch',
  'kbd.gate',
  'turing.cv',
  'turing.gate',
];

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + amount * 30;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

export class SynthEngine {
  ctx: AudioContext | null = null;

  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelGain: GainNode | null = null;
  private outIn: GainNode | null = null;
  private driveIn: GainNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private toneFilter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private spaceWet: GainNode | null = null;
  private vcfIn: GainNode | null = null;
  private vcf: BiquadFilterNode | null = null;
  private vcfOut: GainNode | null = null;
  private vcaIn: GainNode | null = null;
  private vca: GainNode | null = null;
  private vcaOut: GainNode | null = null;
  private mixInA: GainNode | null = null;
  private mixInB: GainNode | null = null;
  private mixInC: GainNode | null = null;
  private mixOut: GainNode | null = null;
  private egSource: ConstantSourceNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private filmGain: GainNode | null = null;
  private filmWanted = false;
  private filmTickBuf: AudioBuffer | null = null;
  private filmCrackleTimer = 0;
  private turingCv: ConstantSourceNode | null = null;
  private turingBits = Array.from({ length: 16 }, () => (Math.random() < 0.5 ? 1 : 0));
  private turingIndex = 0;
  private turingLength = 16;
  private turingLoop = true;
  private turingValue = 0;
  private turingTimer = 0;
  private turingGateTimer = 0;
  private rndGateTimer = 0;

  private buses = new Map<string, AudioNode>();
  private wiring = new Map<string, () => void>();
  private pairs = new Map<string, { from: OutJack; to: InJack }>();
  private vcaCvScales = new Map<GainNode, OutJack>();
  private pitchTargets = new Set<'A' | 'B'>();
  private gateSources = new Set<OutJack>();
  private kbdGateState = false;
  private turingGateState = false;
  private gateState = false;
  private held = new Set<number>();
  private note = 48;
  private activeFlag = false;

  readonly params: SynthParams = {
    tuneA: 0,
    tuneB: 7,
    cutoff: 900,
    resonance: 9,
    level: 0.75,
    vcaLevel: 0.82,
    mixA: 0.8,
    mixB: 0.7,
    mixC: 0.6,
    egAttack: 0.02,
    egDecay: 0.22,
    egSustain: 0.55,
    egRelease: 0.45,
    drive: 0.25,
    tone: 0.85,
    space: 0.22,
    turingRate: 104,
    turingWrite: 0.35,
  };

  private waves: Record<'A' | 'B', WaveName> = { A: 'sawtooth', B: 'square' };

  get isActive(): boolean {
    return this.activeFlag;
  }

  get running(): boolean {
    return this.activeFlag && this.ctx?.state === 'running';
  }

  start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.build();
    }
    const ctx = this.ctx;
    this.activeFlag = true;
    void ctx.resume();
    if (!this.master) return;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(0.9, t + 0.32);
    this.applyNote();
    this.applyFilm();
    this.startTuringClock();
  }

  stop(): void {
    this.activeFlag = false;
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopTuringClock();
    this.kbdGateState = false;
    this.turingGateState = false;
    this.gateState = false;
    this.gate(false);
    this.applyFilm();
    if (this.master) {
      const t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.05);
    }
    window.setTimeout(() => {
      if (!this.activeFlag && this.ctx?.state === 'running') void this.ctx.suspend();
    }, 260);
  }

  private build(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 26;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.28;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    /* выход */
    this.outIn = ctx.createGain();
    this.levelGain = ctx.createGain();
    this.levelGain.gain.value = this.params.level;
    this.outIn.connect(this.levelGain);
    this.levelGain.connect(this.master);

    /* DRIVE / TONE */
    this.driveIn = ctx.createGain();
    this.driveIn.gain.value = 0.72 + this.params.drive * 0.9;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeDriveCurve(this.params.drive);
    this.shaper.oversample = '2x';
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 400 * Math.pow(18000 / 400, this.params.tone);
    this.toneFilter.Q.value = 0.3;
    this.outIn.disconnect(this.levelGain);
    this.outIn.connect(this.driveIn);
    this.driveIn.connect(this.shaper);
    this.shaper.connect(this.toneFilter);
    this.toneFilter.connect(this.levelGain);

    /* SPACE — ленточный эхо-танк */
    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.29;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.18 + this.params.space * 0.34;
    this.spaceWet = ctx.createGain();
    this.spaceWet.gain.value = this.params.space * 0.5;
    this.toneFilter.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.spaceWet);
    this.spaceWet.connect(this.master);

    /* VCF */
    this.vcfIn = ctx.createGain();
    this.vcf = ctx.createBiquadFilter();
    this.vcf.type = 'lowpass';
    this.vcf.frequency.value = this.params.cutoff;
    this.vcf.Q.value = this.params.resonance;
    this.vcfOut = ctx.createGain();
    this.vcfIn.connect(this.vcf);
    this.vcf.connect(this.vcfOut);

    /* VCA */
    this.vcaIn = ctx.createGain();
    this.vca = ctx.createGain();
    this.vca.gain.value = this.params.vcaLevel;
    this.vcaOut = ctx.createGain();
    this.vcaIn.connect(this.vca);
    this.vca.connect(this.vcaOut);

    /* MIX */
    this.mixInA = ctx.createGain();
    this.mixInA.gain.value = this.params.mixA;
    this.mixInB = ctx.createGain();
    this.mixInB.gain.value = this.params.mixB;
    this.mixInC = ctx.createGain();
    this.mixInC.gain.value = this.params.mixC;
    this.mixOut = ctx.createGain();
    this.mixOut.gain.value = 0.7;
    this.mixInA.connect(this.mixOut);
    this.mixInB.connect(this.mixOut);
    this.mixInC.connect(this.mixOut);

    /* источники */
    this.oscA = ctx.createOscillator();
    this.oscA.type = this.waves.A;
    this.oscA.frequency.value = 110;
    this.oscA.detune.value = this.params.tuneA;
    const busA = ctx.createGain();
    busA.gain.value = 0.16;
    this.oscA.connect(busA);

    this.oscB = ctx.createOscillator();
    this.oscB.type = this.waves.B;
    this.oscB.frequency.value = 164.81;
    this.oscB.detune.value = this.params.tuneB;
    const busB = ctx.createGain();
    busB.gain.value = 0.13;
    this.oscB.connect(busB);

    /* EG */
    this.egSource = ctx.createConstantSource();
    this.egSource.offset.value = 0;
    const busEg = ctx.createGain();
    busEg.gain.value = 1;
    this.egSource.connect(busEg);

    this.turingCv = ctx.createConstantSource();
    this.turingCv.offset.value = this.turingValue;

    this.oscA.start();
    this.oscB.start();
    this.egSource.start();
    this.turingCv.start();

    this.buses.set('vcoA.out', busA);
    this.buses.set('vcoB.out', busB);
    this.buses.set('vcf.out', this.vcfOut);
    this.buses.set('vca.out', this.vcaOut);
    this.buses.set('mix.out', this.mixOut);
    this.buses.set('master.out', this.levelGain);
    this.buses.set('eg.out', busEg);
    this.buses.set('turing.cv', this.turingCv);

    for (const { from, to } of this.pairs.values()) this.wire(from, to);
    this.applyNote();
    this.buildFilm();
  }

  private buildFilm(): void {
    const ctx = this.ctx!;
    const film = ctx.createGain();
    film.gain.value = 0;
    film.connect(this.master!);

    /* мотор транспорта */
    const motor = ctx.createOscillator();
    motor.type = 'triangle';
    motor.frequency.value = 46;
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 210;
    motorFilter.Q.value = 0.9;
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.3;
    motor.connect(motorFilter);
    motorFilter.connect(motorGain);
    motorGain.connect(film);

    const motorDrift = ctx.createOscillator();
    motorDrift.type = 'sine';
    motorDrift.frequency.value = 0.23;
    const motorDriftDepth = ctx.createGain();
    motorDriftDepth.gain.value = 1.8;
    motorDrift.connect(motorDriftDepth);
    motorDriftDepth.connect(motor.frequency);

    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 92;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humGain);
    humGain.connect(film);

    /* шелест плёнки в фильмовом канале */
    const len = Math.floor(ctx.sampleRate * 2);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
      data[i] = last;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noise;
    noiseSrc.loop = true;

    const rustleFilter = ctx.createBiquadFilter();
    rustleFilter.type = 'bandpass';
    rustleFilter.frequency.value = 3000;
    rustleFilter.Q.value = 0.65;
    const rustleAm = ctx.createGain();
    rustleAm.gain.value = 0.62;
    const claw = ctx.createOscillator();
    claw.type = 'sine';
    claw.frequency.value = 18;
    const clawDepth = ctx.createGain();
    clawDepth.gain.value = 0.34;
    claw.connect(clawDepth);
    clawDepth.connect(rustleAm.gain);
    noiseSrc.connect(rustleFilter);
    rustleFilter.connect(rustleAm);
    rustleAm.connect(film);

    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = 'lowpass';
    slideFilter.frequency.value = 720;
    slideFilter.Q.value = 0.8;
    const slideAm = ctx.createGain();
    slideAm.gain.value = 0.5;
    const drag = ctx.createOscillator();
    drag.type = 'sine';
    drag.frequency.value = 0.37;
    const dragDepth = ctx.createGain();
    dragDepth.gain.value = 0.2;
    drag.connect(dragDepth);
    dragDepth.connect(slideAm.gain);
    noiseSrc.connect(slideFilter);
    slideFilter.connect(slideAm);
    slideAm.connect(film);

    /* щелчки перфорации */
    const tickLen = Math.floor(ctx.sampleRate * 0.045);
    const tick = ctx.createBuffer(1, tickLen, ctx.sampleRate);
    const tickData = tick.getChannelData(0);
    for (let i = 0; i < tickLen; i++) {
      const decay = 1 - i / tickLen;
      tickData[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    this.filmTickBuf = tick;

    motor.start();
    motorDrift.start();
    hum.start();
    noiseSrc.start();
    claw.start();
    drag.start();
    this.filmGain = film;
    this.applyFilm();
  }

  film(on: boolean): void {
    const wasOn = this.filmWanted;
    this.filmWanted = on;
    if (on && !wasOn && this.activeFlag && this.ctx) this.click('trigger');
    this.applyFilm();
  }

  private applyFilm(): void {
    const ctx = this.ctx;
    const gain = this.filmGain;
    if (!ctx || !gain) return;
    const on = this.activeFlag && this.filmWanted;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(on ? 0.17 : 0.0001, t, on ? 0.12 : 0.2);
    if (on) this.startFilmCrackle();
    else this.stopFilmCrackle();
  }

  private startFilmCrackle(): void {
    if (this.filmCrackleTimer) return;
    const schedule = (): void => {
      this.filmCrackleTimer = window.setTimeout(() => {
        this.filmCrackleTimer = 0;
        if (!this.activeFlag || !this.filmWanted) return;
        this.playFilmCrackle();
        schedule();
      }, 70 + Math.random() * 190);
    };
    schedule();
  }

  private stopFilmCrackle(): void {
    if (!this.filmCrackleTimer) return;
    window.clearTimeout(this.filmCrackleTimer);
    this.filmCrackleTimer = 0;
  }

  private playFilmCrackle(): void {
    const ctx = this.ctx;
    const film = this.filmGain;
    const buf = this.filmTickBuf;
    if (!ctx || !film || !buf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900 + Math.random() * 3200;
    band.Q.value = 0.8 + Math.random() * 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02 + Math.random() * 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018 + Math.random() * 0.035);
    src.connect(band);
    band.connect(gain);
    gain.connect(film);
    src.start(t);
    src.stop(t + 0.09);
  }

  private turingPeriod(): number {
    return 30000 / clamp(this.params.turingRate, 30, 300);
  }

  private startTuringClock(): void {
    this.stopTuringClock();
    if (!this.activeFlag) return;
    this.turingTimer = window.setInterval(() => this.turingStep(), this.turingPeriod());
  }

  private stopTuringClock(): void {
    if (this.turingTimer) {
      window.clearInterval(this.turingTimer);
      this.turingTimer = 0;
    }
    if (this.turingGateTimer) {
      window.clearTimeout(this.turingGateTimer);
      this.turingGateTimer = 0;
    }
    if (this.rndGateTimer) {
      window.clearTimeout(this.rndGateTimer);
      this.rndGateTimer = 0;
    }
    this.turingGateState = false;
  }

  private turingStep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.activeFlag) return;
    const len = this.turingLength;
    this.turingIndex = (this.turingIndex + 1) % len;
    if (!this.turingLoop) {
      this.turingBits[this.turingIndex] = Math.random() < 0.5 ? 1 : 0;
    } else if (Math.random() < clamp(this.params.turingWrite, 0, 1)) {
      this.turingBits[this.turingIndex] = Math.random() < 0.5 ? 1 : 0;
    }

    let value = 0;
    const span = Math.min(8, len);
    for (let i = 0; i < span; i++) value = value * 2 + this.turingBits[(this.turingIndex + i) % len];
    this.turingValue = value / (2 ** span - 1);
    this.turingCv?.offset.setTargetAtTime(this.turingValue, ctx.currentTime, 0.005);

    const pulse = this.turingBits[this.turingIndex] === 1;
    window.clearTimeout(this.turingGateTimer);
    this.turingGateTimer = 0;
    this.turingGateState = pulse;
    this.syncGate();
    if (pulse) {
      this.turingGateTimer = window.setTimeout(() => {
        this.turingGateTimer = 0;
        this.turingGateState = false;
        this.syncGate();
      }, Math.max(40, this.turingPeriod() * 0.52));
    }
  }

  private syncGate(): void {
    const on =
      (this.gateSources.has('kbd.gate') && this.kbdGateState) ||
      (this.gateSources.has('turing.gate') && this.turingGateState);
    if (on === this.gateState) return;
    this.gateState = on;
    this.gate(on);
  }

  getTuringState(): { bits: number[]; index: number; length: number; value: number } {
    return {
      bits: this.turingBits.slice(),
      index: this.turingIndex,
      length: this.turingLength,
      value: this.turingValue,
    };
  }

  setTuringLength(length: number): void {
    this.turingLength = length === 4 || length === 8 ? length : 16;
    this.turingIndex %= this.turingLength;
  }

  setTuringLoop(loop: boolean): void {
    this.turingLoop = loop;
  }

  rndTrigger(note?: number): number {
    const scale = [0, 2, 3, 5, 7, 10, 12, 14, 15, 17, 19, 22, 24];
    const midi = note ?? 48 + scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.28 ? 12 : 0);
    if (!this.activeFlag) return midi;
    this.note = midi;
    this.applyNote();
    this.kbdGateState = true;
    this.syncGate();
    window.clearTimeout(this.rndGateTimer);
    this.rndGateTimer = window.setTimeout(() => {
      this.rndGateTimer = 0;
      this.kbdGateState = false;
      this.syncGate();
    }, 220);
    return midi;
  }

  seqNote(note: number | null): void {
    if (note === null) {
      this.kbdGateState = false;
      this.syncGate();
      return;
    }
    this.note = note;
    this.applyNote();
    this.kbdGateState = true;
    this.syncGate();
  }

  private inputNode(to: AudioIn): GainNode | null {
    switch (to) {
      case 'vcf.in':
        return this.vcfIn;
      case 'vca.in':
        return this.vcaIn;
      case 'mix.inA':
        return this.mixInA;
      case 'mix.inB':
        return this.mixInB;
      case 'mix.inC':
        return this.mixInC;
      case 'out.in':
        return this.outIn;
    }
  }

  private hasInput(to: InJack): boolean {
    for (const pair of this.pairs.values()) if (pair.to === to) return true;
    return false;
  }

  private wire(from: OutJack, to: InJack): void {
    const ctx = this.ctx!;
    const key = `${from}>${to}`;

    if (to === 'adsr.gate') {
      if (from === 'kbd.gate' || from === 'turing.gate') {
        this.gateSources.add(from);
        this.syncGate();
        this.wiring.set(key, () => {
          this.gateSources.delete(from);
          this.syncGate();
        });
      } else {
        this.wiring.set(key, () => {});
      }
      return;
    }

    if (from === 'kbd.pitch' && (to === 'vcoA.cv' || to === 'vcoB.cv')) {
      const target = to === 'vcoA.cv' ? 'A' : 'B';
      this.pitchTargets.add(target);
      this.applyNote();
      this.wiring.set(key, () => {
        this.pitchTargets.delete(target);
      });
      return;
    }

    const src = this.buses.get(from);
    if (!src) return;

    if (to === 'vcf.cv' || to === 'vca.cv' || to === 'vcoA.cv' || to === 'vcoB.cv') {
      const scale = ctx.createGain();
      if (to === 'vcf.cv') {
        scale.gain.value = from === 'eg.out' ? 4200 : from === 'turing.cv' ? 2500 : 180;
        src.connect(scale);
        scale.connect(this.vcf!.frequency);
      } else if (to === 'vca.cv') {
        scale.gain.value =
          from === 'eg.out' ? this.params.vcaLevel : from === 'turing.cv' ? 0.45 : 0.15;
        this.vca!.gain.setValueAtTime(0, ctx.currentTime);
        if (from === 'eg.out') this.vcaCvScales.set(scale, from);
        src.connect(scale);
        scale.connect(this.vca!.gain);
      } else {
        scale.gain.value = from === 'eg.out' ? 1200 : from === 'turing.cv' ? 1200 : 300;
        src.connect(scale);
        scale.connect(to === 'vcoA.cv' ? this.oscA!.detune : this.oscB!.detune);
      }
      this.wiring.set(key, () => {
        src.disconnect(scale);
        scale.disconnect();
        this.vcaCvScales.delete(scale);
        if (to === 'vca.cv' && !this.hasInput('vca.cv')) {
          this.vca?.gain.setValueAtTime(this.params.vcaLevel, ctx.currentTime);
        }
      });
      return;
    }

    const dest = this.inputNode(to);
    if (!dest) return;
    src.connect(dest);
    this.wiring.set(key, () => src.disconnect(dest));
  }

  private valid(from: OutJack, to: InJack): boolean {
    if (!OUT_JACKS.includes(from)) return false;
    if (from === 'kbd.pitch') return to === 'vcoA.cv' || to === 'vcoB.cv';
    if (from === 'kbd.gate') return to === 'adsr.gate';
    if (from === 'turing.gate') return to === 'adsr.gate';
    if (from === 'turing.cv') return to === 'vcf.cv' || to === 'vca.cv' || to === 'vcoA.cv' || to === 'vcoB.cv';
    if (to === 'adsr.gate' || to === 'vcoA.cv' || to === 'vcoB.cv') return false;
    if (from === 'eg.out') return to === 'vcf.cv' || to === 'vca.cv';
    if (from === 'vcf.out' && (to === 'vcf.in' || to === 'vcf.cv')) return false;
    if (from === 'vca.out' && (to === 'vca.in' || to === 'vca.cv')) return false;
    if (from === 'mix.out' && (to === 'mix.inA' || to === 'mix.inB' || to === 'mix.inC')) return false;
    if (from === 'master.out' && to === 'out.in') return false;
    return true;
  }

  connect(from: OutJack, to: InJack): boolean {
    if (!this.valid(from, to)) return false;
    const key = `${from}>${to}`;
    if (this.pairs.has(key)) return false;
    this.pairs.set(key, { from, to });
    if (this.ctx) this.wire(from, to);
    return true;
  }

  disconnect(from: OutJack, to: InJack): void {
    const key = `${from}>${to}`;
    this.pairs.delete(key);
    const unwire = this.wiring.get(key);
    if (unwire) {
      unwire();
      this.wiring.delete(key);
    }
  }

  setParam(name: ParamName, value: number): void {
    this.params[name] = value;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'tuneA':
        this.oscA?.detune.setTargetAtTime(value, t, 0.02);
        break;
      case 'tuneB':
        this.oscB?.detune.setTargetAtTime(value, t, 0.02);
        break;
      case 'cutoff':
        this.vcf?.frequency.setTargetAtTime(clamp(value, 60, 12000), t, 0.03);
        break;
      case 'resonance':
        this.vcf?.Q.setTargetAtTime(clamp(value, 0.1, 24), t, 0.03);
        break;
      case 'level':
        this.levelGain?.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
        break;
      case 'vcaLevel':
        if (this.hasInput('vca.cv')) {
          for (const node of this.vcaCvScales.keys()) {
            node.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
          }
        } else {
          this.vca?.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
        }
        break;
      case 'mixA':
        this.mixInA?.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
        break;
      case 'mixB':
        this.mixInB?.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
        break;
      case 'mixC':
        this.mixInC?.gain.setTargetAtTime(clamp(value, 0, 1), t, 0.03);
        break;
      case 'egAttack':
      case 'egDecay':
      case 'egSustain':
      case 'egRelease':
        break;
      case 'drive':
        if (this.shaper) this.shaper.curve = makeDriveCurve(value);
        this.driveIn?.gain.setTargetAtTime(0.72 + value * 0.9, t, 0.03);
        break;
      case 'tone':
        this.toneFilter?.frequency.setTargetAtTime(400 * Math.pow(18000 / 400, clamp(value, 0, 1)), t, 0.03);
        break;
      case 'space':
        this.spaceWet?.gain.setTargetAtTime(clamp(value, 0, 1) * 0.5, t, 0.05);
        this.delayFeedback?.gain.setTargetAtTime(0.18 + clamp(value, 0, 1) * 0.34, t, 0.05);
        break;
      case 'turingRate':
        if (this.activeFlag) this.startTuringClock();
        break;
      case 'turingWrite':
        break;
    }
  }

  setWave(which: 'A' | 'B', wave: WaveName): void {
    this.waves[which] = wave;
    if (which === 'A' && this.oscA) this.oscA.type = wave;
    if (which === 'B' && this.oscB) this.oscB.type = wave;
  }

  private applyNote(): void {
    if (!this.ctx) return;
    const freq = 440 * Math.pow(2, (this.note - 69) / 12);
    const t = this.ctx.currentTime;
    if (this.pitchTargets.has('A')) this.oscA?.frequency.setTargetAtTime(freq, t, 0.008);
    if (this.pitchTargets.has('B')) this.oscB?.frequency.setTargetAtTime(freq, t, 0.008);
  }

  keyDown(note: number): void {
    this.held.add(note);
    this.note = note;
    this.applyNote();
    this.kbdGateState = true;
    this.syncGate();
  }

  keyUp(note: number): void {
    this.held.delete(note);
    if (this.held.size > 0) {
      this.note = Math.max(...this.held);
      this.applyNote();
      return;
    }
    this.kbdGateState = false;
    this.syncGate();
  }

  gate(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.egSource) return;
    const t = ctx.currentTime;
    const attack = Math.max(0.004, this.params.egAttack);
    const decay = Math.max(0.012, this.params.egDecay);
    const sustain = clamp(this.params.egSustain, 0.001, 1);
    const release = Math.max(0.02, this.params.egRelease);
    const offset = this.egSource.offset;
    try {
      offset.cancelAndHoldAtTime(t);
    } catch {
      offset.cancelScheduledValues(t);
    }
    if (on) {
      offset.linearRampToValueAtTime(1, t + attack);
      offset.linearRampToValueAtTime(sustain, t + attack + decay);
    } else {
      offset.linearRampToValueAtTime(0, t + release);
    }
  }

  getLevel(): number {
    if (!this.analyser || !this.activeFlag) return 0;
    if (!this.levelBuf) this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = this.levelBuf[i];
      sum += v * v;
    }
    return Math.sqrt(sum / this.levelBuf.length);
  }

  getWaveform(out: Float32Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.activeFlag) return false;
    this.analyser.getFloatTimeDomainData(out);
    return true;
  }

  click(kind: 'button' | 'trigger' | 'dial' = 'button'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.activeFlag) return;
    const t = ctx.currentTime;

    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.07);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = kind === 'dial' ? 2300 : kind === 'trigger' ? 820 : 1500;
    band.Q.value = 1.3;
    const gain = ctx.createGain();
    const peak = kind === 'trigger' ? 0.16 : 0.3;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    src.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.06);

    const thock = ctx.createOscillator();
    thock.type = 'sine';
    thock.frequency.setValueAtTime(kind === 'trigger' ? 120 : 190, t);
    thock.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(0.09, t);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    thock.connect(thockGain);
    thockGain.connect(this.master);
    thock.start(t);
    thock.stop(t + 0.055);
  }
}
