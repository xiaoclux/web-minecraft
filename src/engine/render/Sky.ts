import * as THREE from 'three';
import { DAY_LENGTH_TICKS } from '../constants/world';
import { daylightAt, sunHeightAt } from '../world/daylight';

const DAY_COLOR = new THREE.Color(0x87ceeb);
const NIGHT_COLOR = new THREE.Color(0x0b0f24);
const DUSK_COLOR = new THREE.Color(0xd77a3e);
const SUN_DISTANCE = 100;
const SUN_SIZE = 12;
const MOON_SIZE = 8;
const MIN_SKY_LEVEL = 0.27;
/** 太阳高度（sin 值）达到该值即为完全白天。 */
const STAR_COUNT = 400;

/** 天空：背景色、太阳/月亮与昼夜亮度。 */
export class Sky {
  readonly group = new THREE.Group();
  readonly color = new THREE.Color();
  /** 天空光强度 0~1。 */
  skyLevel = 1;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starMaterial: THREE.PointsMaterial;

  constructor() {
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2, fog: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), sunMat);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f0, fog: false });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMat);
    this.group.add(this.sun, this.moon);
    const positions = new Float32Array(STAR_COUNT * 3);
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(rnd() * 2 - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * SUN_DISTANCE * 1.2;
      positions[i * 3 + 1] = Math.cos(phi) * SUN_DISTANCE * 1.2;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * SUN_DISTANCE * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0,
      fog: false,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(geo, this.starMaterial);
    this.group.add(this.stars);
  }

  /**
   * 按世界 tick 更新天空。
   * @param fixedColor 有值时表示这个维度没有昼夜（下界 / 末地）：天幕用固定色、不画日月星
   */
  update(timeTick: number, cameraPos: THREE.Vector3, fixedColor: THREE.Color | null = null): void {
    if (fixedColor) {
      this.skyLevel = 1;
      this.color.copy(fixedColor);
      this.group.position.copy(cameraPos);
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const t = (timeTick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
    // 太阳角度：t=0 日出(东), 0.25 正午, 0.5 日落, 0.75 午夜
    const angle = t * Math.PI * 2;
    const sunHeight = sunHeightAt(timeTick);
    const daylight = daylightAt(timeTick);
    this.skyLevel = MIN_SKY_LEVEL + (1 - MIN_SKY_LEVEL) * daylight;
    this.color.copy(NIGHT_COLOR).lerp(DAY_COLOR, daylight);
    const duskFactor = Math.max(0, 1 - Math.abs(sunHeight) / 0.25) * 0.6;
    this.color.lerp(DUSK_COLOR, duskFactor);
    this.group.position.copy(cameraPos);
    this.sun.position.set(Math.cos(angle) * SUN_DISTANCE, sunHeight * SUN_DISTANCE, 0);
    this.sun.lookAt(cameraPos);
    this.moon.position.set(-Math.cos(angle) * SUN_DISTANCE, -sunHeight * SUN_DISTANCE, 0);
    this.moon.lookAt(cameraPos);
    this.starMaterial.opacity = 1 - daylight;
    this.stars.rotation.z = angle;
  }

  /** 是否白天（用于刷怪/燃烧）。 */
  static isDaytime(timeTick: number): boolean {
    const t = (timeTick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
    return Math.sin(t * Math.PI * 2) > -0.1;
  }
}
