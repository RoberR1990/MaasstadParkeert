// Post-processing: tilt-shift, bloom, colour polish, ACES tone mapping, vignette, SMAA.
import * as THREE from 'three';
import {
  BloomEffect, EffectComposer, EffectPass, HueSaturationEffect, KernelSize, RenderPass, SMAAEffect, SMAAPreset,
  TiltShiftEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, BrightnessContrastEffect,
} from 'postprocessing';

export interface PostOpts { tilt: boolean; smaa: boolean }

export class Post {
  composer: EffectComposer;
  bloom: BloomEffect;
  tilt: TiltShiftEffect;
  vignette: VignetteEffect;
  sat: HueSaturationEffect;
  tone: ToneMappingEffect;
  contrast: BrightnessContrastEffect;
  private smaa: SMAAEffect;
  private renderPass: RenderPass;
  private passes: EffectPass[] = [];
  private opts: PostOpts = { tilt: true, smaa: true };

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(scene, camera);
    // tilt-shift is toned down in round 2: a gentler band keeps the miniature feel without smearing the hero landmarks
    this.tilt = new TiltShiftEffect({ offset: 0.0, rotation: 0, focusArea: 0.85, feather: 0.5, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
    this.bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.1, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72, levels: 7 });
    this.sat = new HueSaturationEffect({ saturation: 0.16, hue: 0 });
    this.contrast = new BrightnessContrastEffect({ contrast: 0.2, brightness: -0.015 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.34, darkness: 0.42 });
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.build();
  }

  private build() {
    for (const p of [...this.composer.passes]) this.composer.removePass(p);
    this.composer.addPass(this.renderPass);
    const fx = [...(this.opts.tilt ? [this.tilt] : []), this.bloom, this.sat, this.contrast, this.tone, this.vignette];
    this.composer.addPass(new EffectPass(this.camera, ...fx));
    if (this.opts.smaa) this.composer.addPass(new EffectPass(this.camera, this.smaa));
  }
  /** quality tiers: low = no tilt-shift (DOF) and no SMAA */
  configure(o: Partial<PostOpts>) {
    const n = { ...this.opts, ...o };
    if (n.tilt === this.opts.tilt && n.smaa === this.opts.smaa) return;
    this.opts = n; this.build();
  }
  setSize(w: number, h: number) { this.composer.setSize(w, h); }
  render(dt: number) { this.composer.render(dt); }
}
