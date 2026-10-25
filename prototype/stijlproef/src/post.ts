// Post-processing: tilt-shift, bloom, colour polish, ACES tone mapping, vignette, SMAA.
import * as THREE from 'three';
import {
  BloomEffect, EffectComposer, EffectPass, HueSaturationEffect, KernelSize, RenderPass, SMAAEffect, SMAAPreset,
  TiltShiftEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, BrightnessContrastEffect,
} from 'postprocessing';

export class Post {
  composer: EffectComposer;
  bloom: BloomEffect;
  tilt: TiltShiftEffect;
  vignette: VignetteEffect;
  sat: HueSaturationEffect;
  tone: ToneMappingEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    this.tilt = new TiltShiftEffect({ offset: 0.02, rotation: 0, focusArea: 0.95, feather: 0.6, kernelSize: KernelSize.MEDIUM, resolutionScale: 0.5 });
    this.bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.1, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72, levels: 7 });
    this.sat = new HueSaturationEffect({ saturation: 0.2, hue: 0 });
    const bc = new BrightnessContrastEffect({ contrast: 0.1, brightness: 0.0 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 });
    this.composer.addPass(new EffectPass(camera, this.tilt, this.bloom, this.sat, bc, this.tone, this.vignette));
    this.composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  setSize(w: number, h: number) { this.composer.setSize(w, h); }
  render(dt: number) { this.composer.render(dt); }
}
