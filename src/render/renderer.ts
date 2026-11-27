/**
 * WebGL2 渲染器：点精灵 + 轨迹线段 + 参考网格 + HDR 色调映射。
 * 顶点布局为 [x,y,z,scalar,size]（stride 20），2D 时 z=0。
 * 投影在顶点着色器完成：2D 正交 / 3D 轨道相机 + 透视缩放。
 */

import type { Snapshot, ViewParams } from '../core/types';
import type { Camera } from './camera';
import { createProgram, getUniforms, type UniformMap } from './gl';
import { PALETTES, STAR_COLOR_COUNT, STELLAR_COLOR_LUT } from './palette';
import { STAR_TYPE_CODES } from '../core/bodies';

/** H1/H2/H3：星色 uniform 数组大小与黑洞编码（shader 常量插值）。 */
const STAR_N = STAR_COLOR_COUNT;
const BH_CODE = STAR_TYPE_CODES.indexOf('blackHole');

/** 公共投影代码：返回 clip.xy 与透视倍率（z 通道）。 */
const PROJECT = `
uniform vec2 uResolution;
uniform float uOffsetX;
uniform float uIs3D;
uniform float uYaw;
uniform float uPitch;
uniform float uZoom;
uniform float uDistance;
uniform vec3 uTarget;

vec3 project(vec3 p) {
  vec3 r = p - uTarget;
  if (uIs3D < 0.5) {
    vec2 clip = (r.xy * uZoom) / (uResolution * 0.5);
    clip.x += uOffsetX;
    return vec3(clip, 1.0);
  }
  float cy = cos(uYaw), sy = sin(uYaw);
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 q = vec3(r.x * cy - r.y * sy, r.x * sy + r.y * cy, r.z);
  vec3 q2 = vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
  float depth = max(0.1, uDistance - q2.z);
  float persp = uDistance / depth;
  vec2 clip = (q2.xy * uZoom * persp) / (uResolution * 0.5);
  clip.x += uOffsetX;
  return vec3(clip, persp);
}
`;

const POINT_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aScalar;
layout(location = 2) in float aSize;
${PROJECT}
uniform float uPointSize;
uniform float uDpr;
out float vScalar;
void main() {
  vec3 pr = project(aPos);
  gl_Position = vec4(pr.xy, 0.0, 1.0);
  gl_PointSize = clamp(uPointSize * aSize * uDpr * clamp(pr.z, 0.4, 3.0), 1.0, 48.0);
  vScalar = aScalar;
}`;

const POINT_FS = `#version 300 es
precision highp float;
in float vScalar;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uGlow;
uniform float uIntensity;
uniform int uStellar;
uniform vec3 uStarColors[${STAR_N}];
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float core = smoothstep(0.25, 0.0, r2);
  core = pow(core, mix(1.4, 0.8, uGlow));
  float rad = sqrt(r2) * 2.0;
  if (uStellar == 1) {
    int code = int(clamp(vScalar, 0.0, ${(STAR_N - 1).toFixed(1)}) + 0.5);
    vec3 col = uStarColors[code];
    if (code == ${BH_CODE}) {
      // 黑洞：黑核 + 亮环
      float ring = smoothstep(0.55, 0.75, rad) * (1.0 - smoothstep(0.9, 1.0, rad));
      float inner = 1.0 - smoothstep(0.35, 0.55, rad);
      vec3 bh = col * ring * 2.2;
      outColor = vec4(bh, (ring + inner * 0.25) * uIntensity);
      return;
    }
    outColor = vec4(col * (0.75 + 0.85 * uGlow), core * uIntensity);
    return;
  }
  float t = clamp(vScalar, 0.0, 1.0);
  vec3 col = t < 0.5 ? mix(uC0, uC1, t * 2.0) : mix(uC1, uC2, (t - 0.5) * 2.0);
  outColor = vec4(col * (0.75 + 0.85 * uGlow), core * uIntensity);
}`;

const TRAIL_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aAlpha;
${PROJECT}
out float vAlpha;
void main() {
  vec3 pr = project(aPos);
  gl_Position = vec4(pr.xy, 0.0, 1.0);
  vAlpha = aAlpha;
}`;

const TRAIL_FS = `#version 300 es
precision highp float;
in float vAlpha;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  outColor = vec4(uColor, vAlpha);
}`;

const LINE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
${PROJECT}
void main() {
  vec3 pr = project(aPos);
  gl_Position = vec4(pr.xy, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  outColor = uColor;
}`;

const FLASH_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aIntensity;
${PROJECT}
uniform float uDpr;
out float vI;
void main() {
  vec3 pr = project(aPos);
  gl_Position = vec4(pr.xy, 0.0, 1.0);
  gl_PointSize = clamp(90.0 * aIntensity * uDpr, 4.0, 220.0);
  vI = aIntensity;
}`;

const FLASH_FS = `#version 300 es
precision highp float;
in float vI;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 3.0) * vI;
  outColor = vec4(vec3(1.0, 0.86, 0.55) * a * 3.0, a);
}`;

const POST_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uExposure;
out vec4 outColor;
void main() {
  vec3 hdr = texture(uTex, vUv).rgb;
  vec3 c = pow(1.0 - exp(-uExposure * hdr), vec3(0.4545));
  outColor = vec4(c, 1.0);
}`;

const PROJ_UNIFORMS = [
  'uResolution',
  'uOffsetX',
  'uIs3D',
  'uYaw',
  'uPitch',
  'uZoom',
  'uDistance',
  'uTarget',
];

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  private pointProgram: WebGLProgram;
  private pointUniforms: UniformMap;
  private pointVao: WebGLVertexArrayObject;
  private pointVbo: WebGLBuffer;
  private pointCapacity = 0;

  private trailProgram: WebGLProgram;
  private trailUniforms: UniformMap;
  private trailVao: WebGLVertexArrayObject;
  private trailVbo: WebGLBuffer;
  private trailCapacity = 0;
  private trailData: Float32Array = new Float32Array(0);

  private lineProgram: WebGLProgram;
  private lineUniforms: UniformMap;
  private lineVao: WebGLVertexArrayObject;
  private lineVbo: WebGLBuffer;
  private gridData = new Float32Array(4096 * 3);

  private flashProgram: WebGLProgram;
  private flashUniforms: UniformMap;
  private flashVao: WebGLVertexArrayObject;
  private flashVbo: WebGLBuffer;
  private flashData = new Float32Array(256 * 4);
  private flashCapacity = 0;

  private postProgram: WebGLProgram;
  private postUniforms: UniformMap;
  private postVao: WebGLVertexArrayObject;
  private hdrFbo: WebGLFramebuffer | null = null;
  private hdrTex: WebGLTexture | null = null;
  private hdrReady = false;

  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;

    this.pointProgram = createProgram(gl, POINT_VS, POINT_FS);
    this.pointUniforms = getUniforms(gl, this.pointProgram, [
      ...PROJ_UNIFORMS,
      'uPointSize',
      'uDpr',
      'uC0',
      'uC1',
      'uC2',
      'uGlow',
      'uIntensity',
      'uStellar',
      'uStarColors',
    ]);
    const pVao = gl.createVertexArray();
    const pVbo = gl.createBuffer();
    if (!pVao || !pVbo) throw new Error('无法创建点缓冲');
    this.pointVao = pVao;
    this.pointVbo = pVbo;
    gl.bindVertexArray(pVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);

    this.trailProgram = createProgram(gl, TRAIL_VS, TRAIL_FS);
    this.trailUniforms = getUniforms(gl, this.trailProgram, [...PROJ_UNIFORMS, 'uColor']);
    const tVao = gl.createVertexArray();
    const tVbo = gl.createBuffer();
    if (!tVao || !tVbo) throw new Error('无法创建轨迹缓冲');
    this.trailVao = tVao;
    this.trailVbo = tVbo;
    gl.bindVertexArray(tVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, tVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);

    this.lineProgram = createProgram(gl, LINE_VS, LINE_FS);
    this.lineUniforms = getUniforms(gl, this.lineProgram, [...PROJ_UNIFORMS, 'uColor']);
    const lVao = gl.createVertexArray();
    const lVbo = gl.createBuffer();
    if (!lVao || !lVbo) throw new Error('无法创建网格缓冲');
    this.lineVao = lVao;
    this.lineVbo = lVbo;
    gl.bindVertexArray(lVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.gridData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

    this.flashProgram = createProgram(gl, FLASH_VS, FLASH_FS);
    this.flashUniforms = getUniforms(gl, this.flashProgram, [...PROJ_UNIFORMS, 'uDpr']);
    const fVao = gl.createVertexArray();
    const fVbo = gl.createBuffer();
    if (!fVao || !fVbo) throw new Error('无法创建闪光缓冲');
    this.flashVao = fVao;
    this.flashVbo = fVbo;
    gl.bindVertexArray(fVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.flashData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    this.postProgram = createProgram(gl, POST_VS, POST_FS);
    this.postUniforms = getUniforms(gl, this.postProgram, ['uTex', 'uExposure']);
    const postVao = gl.createVertexArray();
    if (!postVao) throw new Error('无法创建后处理 VAO');
    this.postVao = postVao;
    gl.bindVertexArray(null);

    this.hdrReady = gl.getExtension('EXT_color_buffer_float') !== null;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 1);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (this.width === w && this.height === h && this.dpr === dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.rebuildTargets();
  }

  private rebuildTargets(): void {
    const gl = this.gl;
    if (!this.hdrReady) return;
    if (this.hdrTex) gl.deleteTexture(this.hdrTex);
    if (this.hdrFbo) gl.deleteFramebuffer(this.hdrFbo);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      this.hdrReady = false;
      return;
    }
    this.hdrTex = tex;
    this.hdrFbo = fbo;
  }

  get cssWidth(): number { return this.width; }
  get cssHeight(): number { return this.height; }

  render(snapshot: Snapshot, camera: Camera, view: ViewParams): void {
    const gl = this.gl;
    this.resize();
    const useHdr = this.hdrReady && this.hdrFbo !== null;
    if (useHdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFbo);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (view.showGrid) this.drawGrid(camera);
    if (snapshot.trajectories && snapshot.trajectoryCount > 0) this.drawTrails(snapshot, camera, view);
    this.drawPoints(snapshot, camera, view);
    this.drawFlashes(snapshot, camera);
    if (useHdr) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(this.postProgram);
      gl.bindVertexArray(this.postVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
      gl.uniform1i(this.postUniforms.uTex, 0);
      gl.uniform1f(this.postUniforms.uExposure, 1.35);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND);
    }
  }

  private setProjection(u: UniformMap, camera: Camera): void {
    const gl = this.gl;
    gl.uniform2f(u.uResolution, this.width, this.height);
    gl.uniform1f(u.uOffsetX, (camera.offsetX * 2) / this.width);
    gl.uniform1f(u.uIs3D, camera.dimensions === 3 ? 1 : 0);
    gl.uniform1f(u.uYaw, camera.yaw);
    gl.uniform1f(u.uPitch, camera.pitch);
    gl.uniform1f(u.uZoom, camera.zoom);
    gl.uniform1f(u.uDistance, camera.distance);
    if (camera.dimensions === 3) {
      gl.uniform3f(u.uTarget, camera.targetX, camera.targetY, camera.targetZ);
    } else {
      gl.uniform3f(u.uTarget, camera.cx, camera.cy, 0);
    }
  }

  private drawPoints(snapshot: Snapshot, camera: Camera, view: ViewParams): void {
    const gl = this.gl;
    const count = snapshot.count;
    if (count <= 0) return;
    gl.useProgram(this.pointProgram);
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVbo);
    const floats = snapshot.vertex.subarray(0, count * 5);
    const bytes = floats.byteLength;
    if (bytes > this.pointCapacity) {
      gl.bufferData(gl.ARRAY_BUFFER, floats, gl.DYNAMIC_DRAW);
      this.pointCapacity = bytes;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, floats);
    }
    const u = this.pointUniforms;
    this.setProjection(u, camera);
    const p = PALETTES[view.colorMode];
    gl.uniform3fv(u.uC0, p.c0);
    gl.uniform3fv(u.uC1, p.c1);
    gl.uniform3fv(u.uC2, p.c2);
    gl.uniform1f(u.uGlow, view.glow ? 1 : 0.25);
    const stellar = view.colorMode === 'stellar';
    gl.uniform1i(u.uStellar, stellar ? 1 : 0);
    if (stellar && u.uStarColors) {
      gl.uniform3fv(u.uStarColors, STELLAR_COLOR_LUT);
    }
    // 少体（≤10）是主要使用场景：放大点尺寸并提升亮度，避免只剩两个暗点
    const few = count > 0 && count <= 10;
    const intensity = few
      ? 2.6
      : Math.min(1, Math.max(0.06, Math.sqrt(2000 / Math.max(count, 1))));
    const sizeScale = few
      ? 3.2
      : count > 120_000 ? 0.7 : count > 40_000 ? 0.85 : 1;
    gl.uniform1f(u.uIntensity, intensity);
    gl.uniform1f(u.uPointSize, Math.min(64, view.pointSize * sizeScale)); // R44 上限保护
    gl.uniform1f(u.uDpr, this.dpr);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  /** G3：超新星闪光（指数衰减 10 步内消失），走同一 HDR 管线。 */
  private drawFlashes(snapshot: Snapshot, camera: Camera): void {
    const f = snapshot.flashes;
    if (!f || f.length === 0) return;
    const step = snapshot.step;
    let n = 0;
    for (let i = 0; i < f.length; i += 4) {
      const age = step - f[i + 3];
      if (age < 0 || age > 10) continue;
      if (n >= 256) break;
      const intensity = Math.exp(-age / 3);
      const o = n * 4;
      this.flashData[o] = f[i];
      this.flashData[o + 1] = f[i + 1];
      this.flashData[o + 2] = f[i + 2];
      this.flashData[o + 3] = intensity;
      n++;
    }
    if (!n) return;
    const gl = this.gl;
    gl.useProgram(this.flashProgram);
    gl.bindVertexArray(this.flashVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flashVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flashData.subarray(0, n * 4));
    const u = this.flashUniforms;
    this.setProjection(u, camera);
    gl.uniform1f(u.uDpr, this.dpr);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }

  private drawTrails(snapshot: Snapshot, camera: Camera, view: ViewParams): void {
    const gl = this.gl;
    const traj = snapshot.trajectories;
    if (!traj) return;
    const bodies = snapshot.trajectoryCount;
    const points = snapshot.trajectoryPoints;
    const head = snapshot.trajectoryHead;
    const filled = Math.max(0, Math.min(snapshot.trajectoryFilled, points));
    if (filled < 2) return;

    const needed = bodies * (filled - 1) * 2 * 4;
    if (this.trailData.length < needed) this.trailData = new Float32Array(Math.ceil(needed * 1.3));
    const out = this.trailData;
    let o = 0;
    const strength = 0.55 * view.trailLength;

    for (let bIdx = 0; bIdx < bodies; bIdx++) {
      const base = bIdx * points * 3;
      let px = 0;
      let py = 0;
      let pz = 0;
      let hasPrev = false;
      for (let k = 0; k < filled; k++) {
        const slot = (head - filled + k + points) % points;
        const x = traj[base + slot * 3];
        const y = traj[base + slot * 3 + 1];
        const z = traj[base + slot * 3 + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          hasPrev = false;
          continue;
        }
        if (hasPrev) {
          const age = k / filled;
          const alpha = age * age * strength;
          out[o++] = px; out[o++] = py; out[o++] = pz; out[o++] = alpha * 0.45;
          out[o++] = x; out[o++] = y; out[o++] = z; out[o++] = alpha;
        }
        px = x; py = y; pz = z; hasPrev = true;
      }
    }
    if (o === 0) return;

    gl.useProgram(this.trailProgram);
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    const verts = o / 4;
    if (o * 4 > this.trailCapacity) {
      gl.bufferData(gl.ARRAY_BUFFER, out.subarray(0, o), gl.DYNAMIC_DRAW);
      this.trailCapacity = o * 4;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, out.subarray(0, o));
    }
    const u = this.trailUniforms;
    this.setProjection(u, camera);
    gl.uniform3fv(u.uColor, PALETTES[view.colorMode].trail);
    gl.drawArrays(gl.LINES, 0, verts);
  }

  private drawGrid(camera: Camera): void {
    const gl = this.gl;
    const is3D = camera.dimensions === 3;
    const view = camera.viewBounds(this.width, this.height);
    const step = niceStep(90 / camera.zoom);
    const data = this.gridData;
    let n = 0;
    const z = is3D ? camera.targetZ : 0;

    if (is3D) {
      // 3D 网格：按小段绘制并剔除靠近相机的部分，避免跨越相机平面的线段被透视拉成放射状
      const cx = camera.targetX;
      const cy = camera.targetY;
      const extent = Math.min(12 * step, camera.distance * 0.35);
      const seg = Math.max(step, extent / 12);
      const project = (x: number, y: number): boolean => {
        const p = camera.project(x, y, z, this.width, this.height);
        return !p.behind && p.depth > camera.distance * 0.15;
      };
      const pushSeg = (x0: number, y0: number, x1: number, y1: number): void => {
        if (n >= data.length - 6) return;
        if (!project(x0, y0) || !project(x1, y1)) return;
        data[n++] = x0; data[n++] = y0; data[n++] = z;
        data[n++] = x1; data[n++] = y1; data[n++] = z;
      };
      const sx = Math.ceil((cx - extent) / step) * step;
      const sy = Math.ceil((cy - extent) / step) * step;
      for (let x = sx; x < cx + extent; x += step) {
        for (let t = cy - extent; t < cy + extent; t += seg) {
          pushSeg(x, t, x, Math.min(t + seg, cy + extent));
        }
      }
      for (let y = sy; y < cy + extent; y += step) {
        for (let t = cx - extent; t < cx + extent; t += seg) {
          pushSeg(t, y, Math.min(t + seg, cx + extent), y);
        }
      }
    } else {
      const startX = Math.ceil(view.minX / step) * step;
      const startY = Math.ceil(view.minY / step) * step;
      for (let x = startX; x <= view.maxX && n < data.length - 6; x += step) {
        data[n++] = x; data[n++] = view.minY; data[n++] = 0;
        data[n++] = x; data[n++] = view.maxY; data[n++] = 0;
      }
      for (let y = startY; y <= view.maxY && n < data.length - 6; y += step) {
        data[n++] = view.minX; data[n++] = y; data[n++] = 0;
        data[n++] = view.maxX; data[n++] = y; data[n++] = 0;
      }
    }
    if (n === 0) return;

    gl.useProgram(this.lineProgram);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n));
    const u = this.lineUniforms;
    this.setProjection(u, camera);
    gl.uniform4f(u.uColor, 0.35, 0.5, 0.75, 0.045);
    gl.drawArrays(gl.LINES, 0, n / 3);
  }

  dispose(): void {
    const gl = this.gl;
    for (const p of [this.pointProgram, this.trailProgram, this.lineProgram, this.postProgram]) gl.deleteProgram(p);
    for (const b of [this.pointVbo, this.trailVbo, this.lineVbo]) gl.deleteBuffer(b);
    for (const v of [this.pointVao, this.trailVao, this.lineVao, this.postVao]) gl.deleteVertexArray(v);
    if (this.hdrTex) gl.deleteTexture(this.hdrTex);
    if (this.hdrFbo) gl.deleteFramebuffer(this.hdrFbo);
  }
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const n = raw / base;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base;
}
