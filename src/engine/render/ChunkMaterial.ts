import * as THREE from 'three';

/** 最低环境亮度（全黑时仍可见轮廓）。 */
const MIN_BRIGHTNESS = 0.035;
/** 镂空 alpha 阈值。 */
const CUTOUT_ALPHA_TEST = 0.5;

const VERTEX_SHADER = /* glsl */ `
attribute vec3 aLight;
varying vec2 vUv;
varying vec3 vLight;
varying float vFogDepth;
void main() {
  vUv = uv;
  vLight = aLight;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform float uSkyLevel;
uniform float uMinLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaTest;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vLight;
varying float vFogDepth;

float lightCurve(float level) {
  // 近似 MC 的亮度表：低亮度更暗、高亮度接近线性
  return level / (4.0 - 3.0 * level);
}

void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < uAlphaTest) {
    discard;
  }
  float sky = vLight.x * uSkyLevel;
  float block = vLight.y;
  // 夜视把整体亮度托到 uMinLight 以上
  float level = max(max(sky, block), uMinLight);
  float brightness = mix(${MIN_BRIGHTNESS.toFixed(3)}, 1.0, lightCurve(level)) * vLight.z;
  // 火把光偏暖
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.92, 0.78), clamp(block - sky, 0.0, 1.0));
  vec3 color = texel.rgb * brightness * tint;
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = mix(color, uFogColor, fogFactor);
  gl_FragColor = vec4(color, texel.a * uOpacity);
}
`;

/** chunk 着色器材质的共享 uniform。 */
export interface ChunkUniforms {
  uMap: { value: THREE.Texture };
  uSkyLevel: { value: number };
  uMinLight: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uAlphaTest: { value: number };
  uOpacity: { value: number };
}

/** 创建三种 chunk 材质（共享天空亮度/雾 uniform 对象）。 */
export function createChunkMaterials(
  map: THREE.Texture,
  shared: {
    uSkyLevel: { value: number };
    uMinLight: { value: number };
    uFogColor: { value: THREE.Color };
    uFogNear: { value: number };
    uFogFar: { value: number };
  },
): { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; translucent: THREE.ShaderMaterial } {
  const make = (alphaTest: number, opacity: number, extra: THREE.ShaderMaterialParameters): THREE.ShaderMaterial => {
    const uniforms: ChunkUniforms = {
      uMap: { value: map },
      uSkyLevel: shared.uSkyLevel,
      uMinLight: shared.uMinLight,
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
      uAlphaTest: { value: alphaTest },
      uOpacity: { value: opacity },
    };
    return new THREE.ShaderMaterial({
      uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      ...extra,
    });
  };
  return {
    opaque: make(0, 1, { side: THREE.FrontSide }),
    cutout: make(CUTOUT_ALPHA_TEST, 1, { side: THREE.DoubleSide }),
    translucent: make(0, 0.8, { side: THREE.DoubleSide, transparent: true, depthWrite: false }),
  };
}
