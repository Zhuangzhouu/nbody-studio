/**
 * 相机：2D 正交视图 + 3D 轨道相机（yaw/pitch/距离/目标点）。
 *
 * 本文件是「世界 ↔ 屏幕」投影的【唯一真源】：
 *  - renderer.ts 的顶点着色器 PROJECT 与本文件的 project()/screenToWorldPlane() 必须保持一致；
 *  - 拾取、拖放创建、跟随、触屏全部调用这里的方法，禁止在 UI 里另写一份变换。
 */

import type { Dimensions } from '../core/types';

export interface ProjectedPoint {
  /** 屏幕像素 x。 */
  x: number;
  /** 屏幕像素 y（向下为正）。 */
  y: number;
  /** 相机空间深度（用于排序/裁剪）。 */
  depth: number;
  /** 透视放大倍率。 */
  persp: number;
  /** 是否在相机后方。 */
  behind: boolean;
}

export class Camera {
  dimensions: Dimensions = 2;

  /** 2D：视口中心。 */
  cx = 0;
  cy = 0;
  /** 2D：每世界单位像素数；3D：distance 处的像素/世界单位。 */
  zoom = 8;
  /** 为左侧面板预留的横向偏移（像素）。 */
  offsetX = 0;

  /** 3D：绕竖直轴旋转。 */
  yaw = -0.65;
  /** 3D：俯仰角。 */
  pitch = 0.55;
  /** 3D：相机到目标的距离。 */
  distance = 90;
  /** 3D：观察目标。 */
  targetX = 0;
  targetY = 0;
  targetZ = 0;

  /** A3：跟随的天体索引；null 表示不跟随。 */
  followTarget: number | null = null;
  /** C3：质心参考系显示（只影响视图）。 */
  comReference = false;

  fit(bounds: [number, number, number, number], width: number, height: number, padding = 0.12): void {
    const [minX, minY, maxX, maxY] = bounds;
    const w = Math.max(maxX - minX, 1e-6);
    const h = Math.max(maxY - minY, 1e-6);
    this.cx = (minX + maxX) * 0.5;
    this.cy = (minY + maxY) * 0.5;
    const usable = Math.max(160, width - Math.abs(this.offsetX) * 2);
    this.zoom = Math.max(1e-4, Math.min(usable / w, height / h) * (1 - padding));
  }

  /** 三维包围盒自适应取景。 */
  fit3(
    b: [number, number, number, number, number, number],
    width: number,
    height: number,
    padding = 0.12,
  ): void {
    const [minX, minY, minZ, maxX, maxY, maxZ] = b;
    this.targetX = (minX + maxX) * 0.5;
    this.targetY = (minY + maxY) * 0.5;
    this.targetZ = (minZ + maxZ) * 0.5;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    this.distance = extent * 1.7;
    const usable = Math.max(160, width - Math.abs(this.offsetX) * 2);
    this.zoom = Math.max(1e-4, (Math.min(usable, height) / (extent * 1.25)) * (1 - padding));
  }

  /** 以指定中心做局部取景（A3 跟随时按 F）。 */
  fitAround(x: number, y: number, z: number, extent: number, width: number, height: number): void {
    const e = Math.max(extent, 1e-6);
    if (this.dimensions === 3) {
      this.targetX = x;
      this.targetY = y;
      this.targetZ = z;
      this.distance = e * 1.7;
      this.zoom = Math.max(1e-4, Math.min(width - Math.abs(this.offsetX) * 2, height) / (e * 1.25));
    } else {
      this.cx = x;
      this.cy = y;
      const usable = Math.max(160, width - Math.abs(this.offsetX) * 2);
      this.zoom = Math.max(1e-4, Math.min(usable / e, height / e));
    }
  }

  panPixels(dx: number, dy: number): void {
    if (this.dimensions === 3) {
      const wx = -dx / Math.max(1e-6, this.zoom);
      const wy = dy / Math.max(1e-6, this.zoom);
      const cy = Math.cos(this.yaw);
      const sy = Math.sin(this.yaw);
      this.targetX += wx * cy - wy * sy;
      this.targetY += wx * sy + wy * cy;
      return;
    }
    this.cx -= dx / this.zoom;
    this.cy += dy / this.zoom;
  }

  /** 3D 轨道旋转。 */
  rotate(dx: number, dy: number): void {
    this.yaw += dx * 0.006;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.006));
  }

  zoomAt(screenX: number, screenY: number, factor: number, width: number, height: number): void {
    if (this.dimensions === 3) {
      this.zoom = Math.min(1e5, Math.max(1e-4, this.zoom * factor));
      return;
    }
    const before = this.screenToWorld(screenX, screenY, width, height);
    this.zoom = Math.min(1e5, Math.max(1e-4, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY, width, height);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  /** 与 renderer.ts 顶点着色器 PROJECT 完全一致的 CPU 投影。 */
  project(wx: number, wy: number, wz: number, width: number, height: number): ProjectedPoint {
    if (this.dimensions === 2) {
      return {
        x: (wx - this.cx) * this.zoom + width * 0.5 + this.offsetX,
        y: height * 0.5 - (wy - this.cy) * this.zoom,
        depth: 1,
        persp: 1,
        behind: false,
      };
    }
    const rx = wx - this.targetX;
    const ry = wy - this.targetY;
    const rz = wz - this.targetZ;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // q = 绕 yaw 旋转；q2 = 绕 pitch 旋转
    const qx = rx * cy - ry * sy;
    const qy = rx * sy + ry * cy;
    const q2y = qy * cp - rz * sp;
    const q2z = qy * sp + rz * cp;
    const rawDepth = this.distance - q2z;
    const depth = Math.max(0.1, rawDepth);
    const persp = this.distance / depth;
    return {
      x: qx * this.zoom * persp + width * 0.5 + this.offsetX,
      y: height * 0.5 - q2y * this.zoom * persp,
      depth,
      persp,
      behind: rawDepth <= 0.1,
    };
  }

  /**
   * 屏幕坐标反投影到「过 target、法向为视线方向」的视平面（3D），
   * 或正交平面（2D）。与 project() 互为逆运算。
   */
  screenToWorldPlane(
    sx: number,
    sy: number,
    width: number,
    height: number,
  ): { x: number; y: number; z: number } {
    if (this.dimensions === 2) {
      return {
        x: (sx - width * 0.5 - this.offsetX) / this.zoom + this.cx,
        y: (height * 0.5 - sy) / this.zoom + this.cy,
        z: 0,
      };
    }
    // 视平面 q2.z = 0 → depth = distance → persp = 1
    const q2x = (sx - width * 0.5 - this.offsetX) / this.zoom;
    const q2y = (height * 0.5 - sy) / this.zoom;
    const cy = Math.cos(this.yaw);
    const syaw = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // 逆 pitch：q2.z=0
    const qx = q2x;
    const qy = q2y * cp;
    const qz = -q2y * sp;
    // 逆 yaw
    return {
      x: this.targetX + qx * cy + qy * syaw,
      y: this.targetY - qx * syaw + qy * cy,
      z: this.targetZ + qz,
    };
  }

  screenToWorld(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const p = this.screenToWorldPlane(x, y, width, height);
    return { x: p.x, y: p.y };
  }

  worldToScreen(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const p = this.project(x, y, 0, width, height);
    return { x: p.x, y: p.y };
  }

  /** 2D 网格用的可见范围。 */
  viewBounds(width: number, height: number): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfW = width * 0.5 / this.zoom;
    const halfH = height * 0.5 / this.zoom;
    return {
      minX: this.cx - halfW,
      maxX: this.cx + halfW,
      minY: this.cy - halfH,
      maxY: this.cy + halfH,
    };
  }
}
