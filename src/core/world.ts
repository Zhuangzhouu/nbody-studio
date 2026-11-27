/**
 * World：把「初始条件 / 逐体配置 → 求解器 → 积分器 → 碰撞 → 诊断 → 快照」串起来。
 * 纯逻辑，不碰 DOM / WebGL，可在 Node 中直接数值测试。
 */

import { BodySet } from './bodies';
import { computeDynamics, type DynamicsReport } from './dynamics';
import { applyStarConfig, refreshStarAfterMassChange } from './stellar-state';
import { STAR_TYPE_CODES, starTypeCode } from './bodies';
import {
  advanceEvolution,
  isRemnant,
  mainSequenceLifespan,
  MS_WIND_MIN_MSUN,
  MS_WIND_RATE_PER_MYR,
  neverEvolves,
  phaseOf,
  physMass,
  physTime,
  starLabel,
  starSizeMul,
  supernovaKick,
  remnantRadiusAu,
  toSimRadius,
  TRANSFER_DISTANCE_FACTOR,
  TRANSFER_ESCAPE_FRACTION,
  TRANSFER_EVENT_BATCH_MYR,
  TRANSFER_MASS_RATIO,
  TRANSFER_RATE_PER_MYR,
  TIDAL_STRIPPING_RATE_PER_MYR,
  windLossFraction,
  WR_WIND_BATCH_MYR,
  WR_WIND_RATE_PER_MYR,
} from './stellar';
import type { RuntimeStarType, StarType } from './types';
import { starAge } from './stellar-state';
import { MAX_BODY_INPUT } from './constants';
import { resolveCollisions, type CollisionStats } from './collision';
import { DEFAULT_STELLAR } from './params';
import { computeEnergy, type EnergyBreakdown } from './energy';
import { BarnesHutSolver } from './forces/barnes-hut';
import { DirectSolver } from './forces/direct';
import { ParticleMeshSolver } from './forces/particle-mesh';
import { TreePMSolver } from './forces/treepm';
import type { ForceSolver } from './forces/solver';
import { generateBodies } from './generator';
import { stepRk4, stepVerlet, stepYoshida4 } from './integrator';
import { clamp } from './mathx';
import { effectiveIntegrator, resolveStrategy, type Strategy } from './scale-policy';
import type {
  BodyConfig,
  Diagnostics,
  InitParams,
  MetricsSample,
  PerfSample,
  PhysicsParams,
  Snapshot,
  ViewParams,
  StellarConfig,
  StellarEvent,
} from './types';

export interface WorldConfig {
  init: InitParams;
  physics: PhysicsParams;
  view: ViewParams;
  stellar?: StellarConfig;
  /** 显式逐体配置；存在时完全替代程序化生成器。 */
  bodies?: BodyConfig[];
}

function createSolver(strategy: Strategy): ForceSolver {
  switch (strategy.engine) {
    case 'direct':
      return new DirectSolver();
    case 'barnes-hut':
      return new BarnesHutSolver();
    case 'particle-mesh':
      return new ParticleMeshSolver(strategy.gridSize || undefined);
    case 'treepm':
      return new TreePMSolver(strategy.gridSize || undefined);
    default:
      return new DirectSolver();
  }
}

export class World {
  bodies: BodySet;
  solver: ForceSolver;
  strategy: Strategy;
  physics: PhysicsParams;
  init: InitParams;
  view: ViewParams;
  stellar: StellarConfig;
  /** G2：演化事件缓冲（最近若干条）。 */
  stellarEvents: StellarEvent[] = [];
  /** G3：闪光缓冲 [x,y,z,birthStep] × n（主线程渲染后清理）。 */
  flashes: number[] = [];
  /** 是否来自显式逐体配置。 */
  readonly explicitBodies: boolean;

  stepCount = 0;
  time = 0;
  mergedTotal = 0;
  contactTotal = 0;
  lastStepMs = 0;

  private integrator: PhysicsParams['integrator'];
  private accelReady = false;
  private collisionStats: CollisionStats = { contacts: 0, merges: 0 };
  private initialEnergy: number | null = null;
  private energy: EnergyBreakdown | null = null;
  private lastEnergyStep = -9999;
  private dynamics: ReturnType<typeof computeDynamics> | null = null;
  private lastDynStep = -9999;
  private dtEff = 0;
  private msForceEma = 0;
  private msIntegrateEma = 0;
  private msCollisionEma = 0;
  /** A1：创建后尚未重建的次数（调试计数）。 */
  rebuildCount = 0;

  private vertexBuf: Float32Array;
  private trailX: Float32Array | null = null;
  private trailY: Float32Array | null = null;
  private trailZ: Float32Array | null = null;
  private trailHead = 0;
  private trailFilled = 0;
  private trailCount = 0;
  private trailPoints = 0;
  private histX = new Int32Array(0);
  private histY = new Int32Array(0);
  private histZ = new Int32Array(0);

  constructor(cfg: WorldConfig) {
    const explicit = !!cfg.bodies && cfg.bodies.length > 0;
    this.explicitBodies = explicit;
    const count = explicit ? cfg.bodies!.length : cfg.init.count;
    const init = { ...cfg.init, count: clamp(count, 1, MAX_BODY_INPUT) };
    this.init = init;
    this.physics = { ...cfg.physics };
    this.view = { ...cfg.view };
    this.stellar = { ...DEFAULT_STELLAR, ...(cfg.stellar ?? {}) };
    this.strategy = resolveStrategy(init.count, this.physics, this.view);
    this.integrator = effectiveIntegrator(this.strategy.engine, this.physics.integrator);

    this.bodies = explicit
      ? buildFromConfigs(cfg.bodies!, this.strategy.simulated, this.strategy.weight, this.physics, this.stellar)
      : generateBodies(init, {
          simulated: this.strategy.simulated,
          weight: this.strategy.weight,
          requested: this.strategy.requested,
          G: this.physics.G,
          bodyRadius: this.physics.bodyRadius,
          dimensions: this.physics.dimensions,
        });

    this.solver = createSolver(this.strategy);
    this.vertexBuf = new Float32Array(Math.max(5, this.strategy.renderCount * 5));
    this.resetTrails();

    this.energy = computeEnergy(this.bodies, this.physics.G, this.physics.softening);
    this.initialEnergy = this.energy ? this.energy.total : null;
  }

  /** 实时更新物理参数（不重建天体）。 */
  setPhysics(next: PhysicsParams): void {
    const prev = this.physics;
    const radiusChanged = prev.bodyRadius !== next.bodyRadius;
    const dimChanged = prev.dimensions !== next.dimensions;
    this.physics = { ...next };
    this.bodies.dimensions = next.dimensions;

    if (dimChanged) {
      if (next.dimensions === 2) {
        this.bodies.z.fill(0);
        this.bodies.vz.fill(0);
        this.bodies.az.fill(0);
      }
      this.resetTrails();
    }

    if (
      radiusChanged ||
      prev.G !== next.G ||
      prev.softening !== next.softening ||
      prev.theta !== next.theta ||
      prev.collision !== next.collision ||
      prev.engine !== next.engine ||
      prev.maxSimulated !== next.maxSimulated ||
      prev.sampling !== next.sampling ||
      prev.pmGrid !== next.pmGrid
    ) {
      this.strategy = resolveStrategy(this.init.count, this.physics, this.view);
      this.solver = createSolver(this.strategy);
    }

    if (radiusChanged) this.bodies.refreshRadii(next.bodyRadius);

    if (
      prev.G !== next.G ||
      prev.softening !== next.softening ||
      prev.theta !== next.theta ||
      radiusChanged ||
      dimChanged
    ) {
      this.accelReady = false;
      this.lastEnergyStep = -9999;
    }

    this.integrator = effectiveIntegrator(this.strategy.engine, next.integrator);
  }

  /** 实时更新显示参数。 */
  setView(next: ViewParams): void {
    const prev = this.view;
    this.view = { ...next };
    this.strategy = resolveStrategy(this.init.count, this.physics, this.view);

    if (
      prev.trails !== next.trails ||
      prev.trailBodies !== next.trailBodies ||
      prev.trailPoints !== next.trailPoints
    ) {
      this.resetTrails();
    }
    const newVerts = Math.max(5, this.strategy.renderCount * 5);
    if (this.vertexBuf.length < newVerts) this.vertexBuf = new Float32Array(newVerts);
  }

  private resetTrails(): void {
    this.trailCount = this.strategy.trailsEnabled ? this.strategy.trailCount : 0;
    this.trailPoints = this.strategy.trailPoints;
    this.trailX = this.trailCount > 0 ? new Float32Array(this.trailCount * this.trailPoints) : null;
    this.trailY = this.trailCount > 0 ? new Float32Array(this.trailCount * this.trailPoints) : null;
    this.trailZ = this.trailCount > 0 ? new Float32Array(this.trailCount * this.trailPoints) : null;
    this.trailHead = 0;
    this.trailFilled = 0;
    if (this.trailCount > 0) this.recordTrails();
  }

  private recordTrails(): void {
    const tx = this.trailX;
    const ty = this.trailY;
    const tz = this.trailZ;
    if (!tx || !ty || !tz) return;
    const slot = this.trailHead * this.trailCount;
    const { x, y, z, mass } = this.bodies;
    for (let i = 0; i < this.trailCount; i++) {
      const write = slot + i;
      if (mass[i] > 0) {
        tx[write] = x[i];
        ty[write] = y[i];
        tz[write] = z[i];
      } else {
        tx[write] = Number.NaN;
        ty[write] = Number.NaN;
        tz[write] = Number.NaN;
      }
    }
    this.trailHead = (this.trailHead + 1) % this.trailPoints;
    this.trailFilled = Math.min(this.trailFilled + 1, this.trailPoints);
  }

  step(): void {
    const p = this.physics;
    const t0 = now();
    const tF0 = now();

    // D2：自适应步长
    const dt = this.computeDt(p);
    this.dtEff = dt;

    if (this.integrator === 'rk4') {
      stepRk4(this.bodies, this.solver, p, dt);
      this.accelReady = true;
    } else if (this.integrator === 'yoshida4') {
      stepYoshida4(this.bodies, this.solver, p, dt);
      this.accelReady = true;
    } else {
      stepVerlet(this.bodies, this.solver, p, dt, this.accelReady);
      this.accelReady = true;
    }
    const tI1 = now();

    this.stepCount++;
    this.time += dt;

    if (this.strategy.collisionsEnabled) {
      resolveCollisions(this.bodies, p, this.collisionStats, this.stellar);
      this.contactTotal += this.collisionStats.contacts;
      if (this.collisionStats.merges > 0) {
        this.mergedTotal += this.collisionStats.merges;
        this.accelReady = false;
        this.compactIfNeeded();
      }
    }
    const tC1 = now();

    // E4：分段指数平滑
    const force = tI1 - tF0;
    const integrate = 0; // 求力已含在积分器内；单列积分开销无法无侵入拆分
    const collision = tC1 - tI1;
    const total = tC1 - t0;
    this.msForceEma = this.msForceEma ? this.msForceEma * 0.85 + force * 0.15 : force;
    this.msIntegrateEma = this.msIntegrateEma * 0.85 + integrate * 0.15;
    this.msCollisionEma = this.msCollisionEma * 0.85 + collision * 0.15;
    this.lastStepMs = total;

    // G2 + H2/H3 + J 组：演化与恒星交互（O(N)～O(K²)，仅 auto 体与小规模恒星集合）
    if (this.stellarEvents.length < 100) {
      const tPhys = physTime(this.time, this.stellar);
      const dtMyr = this.lastEvolveMyr >= 0 ? Math.max(0, tPhys - this.lastEvolveMyr) : 0;
      this.lastEvolveMyr = tPhys;
      this.evolveStars(dtMyr);
      this.tidalDisruption(dtMyr);
      this.massTransfer(dtMyr);
    }
  }

  /** 演化事件入缓冲（Worker 侧保留最近 50 条），并附带该体的恒星快照（I1 信息卡）。 */
  private pushStellarEvent(e: StellarEvent): void {
    const b = this.bodies;
    const i = e.bodyId;
    if (i < b.n && b.mass[i] > 0) {
      const tPhys = physTime(this.time, this.stellar);
      const type = b.starAt(i);
      const phase = phaseOf(type as RuntimeStarType);
      e.star = {
        type: type as string,
        massPhys: physMass(b.mass[i], this.stellar),
        ageMyr: starAge(b, i, tPhys),
        phaseEndMyr: b.lifespanMyr[i],
        phase: phase === null ? (isRemnant(type as RuntimeStarType) ? '遗骸' : type === 'brownDwarf' ? '永驻' : '非演化体')
          : phase === 'ms' ? '主序'
          : phase === 'giant' ? '红巨星'
          : phase === 'supergiant' ? '红超巨星' : '沃尔夫-拉叶',
      };
    }
    this.stellarEvents.push(e);
    if (this.stellarEvents.length > 50) this.stellarEvents.shift();
  }

  /** H3：上次 evolveStars 的物理时刻（Myr），用于计算每步星风流失的 Δt。 */
  private lastEvolveMyr = -1;

  /**
   * G2 + H2/H3 + J1/J3：主序演化状态机（含红巨星 / 红超巨星 / 沃尔夫-拉叶相位、
   * WR 星风流失、J1 大质量主序星星风、J3 超新星冲击波汽化）。
   * 相位推进的触发时机由 lifespanMyr 控制（进入相位时固定为 age + duration）；
   * 显式 star.type 体不参与（evolvesFlag=0）。
   */
  private evolveStars(dtMyr: number): void {
    const b = this.bodies;
    const tPhys = physTime(this.time, this.stellar);
    const massUnit = this.stellar.massUnit;
    const useZ = this.physics.dimensions === 3;
    for (let i = 0; i < b.n; i++) {
      if (b.mass[i] <= 0 || !b.evolvesFlag[i]) continue;
      const mPhys = physMass(b.mass[i], this.stellar);
      if (neverEvolves(mPhys)) continue;
      const age = starAge(b, i, tPhys);
      const phase = phaseOf(b.starAt(i));
      if (!phase) continue;

      // H3：沃尔夫-拉叶星风流失（每步连续指数衰减；质量缩放不改速度）
      if (phase === 'wolfRayet' && dtMyr > 0) {
        const lossSim = b.mass[i] * windLossFraction(dtMyr, WR_WIND_RATE_PER_MYR);
        if (lossSim > 0) {
          b.mass[i] -= lossSim;
          b.grav[i] -= lossSim;
          b.invalidateGravCache();
          this.accelReady = false;
          this.lastEnergyStep = -9999;
        }
        // 事件按 WR_WIND_BATCH_MYR 聚合，避免事件风暴
        if (tPhys - b.phaseAppliedMyr[i] >= WR_WIND_BATCH_MYR) {
          b.phaseAppliedMyr[i] = tPhys;
          this.pushStellarEvent({
            t: tPhys,
            bodyId: i,
            text: `沃尔夫-拉叶星风流失（当前 M=${physMass(b.mass[i], this.stellar).toFixed(2)} M☉）`,
          });
        }
      }

      // J1：大质量主序星星风（M > 8 M☉，开关 stellar.wind；跨带时重推导光谱型，
      // 遗骸锚点口径 = 耗尽时刻质量）
      if (phase === 'ms' && this.stellar.wind && mPhys > MS_WIND_MIN_MSUN && dtMyr > 0) {
        const lossSim = b.mass[i] * windLossFraction(dtMyr, MS_WIND_RATE_PER_MYR);
        if (lossSim > 0) {
          b.mass[i] -= lossSim;
          b.grav[i] -= lossSim;
          refreshStarAfterMassChange(b, i, this.stellar, tPhys);
          b.invalidateGravCache();
          this.accelReady = false;
          this.lastEnergyStep = -9999;
        }
        if (tPhys - b.phaseAppliedMyr[i] >= WR_WIND_BATCH_MYR) {
          b.phaseAppliedMyr[i] = tPhys;
          this.pushStellarEvent({
            t: tPhys,
            bodyId: i,
            text: `星风流失（当前 M=${physMass(b.mass[i], this.stellar).toFixed(2)} M☉）`,
          });
        }
      }

      // 相位结束时刻（主序 = t_MS；主序后相位在进入时已固定）
      if (age < b.lifespanMyr[i]) continue;
      const ev = advanceEvolution(mPhys, age, massUnit, phase);
      if (ev.kind === 'none') continue;

      // 相位推进：只改类型与相时长，不动质量与动力学
      if (ev.kind === 'toGiant' || ev.kind === 'toSupergiant' || ev.kind === 'toWolfRayet') {
        const next = ev.kind === 'toGiant' ? 'giant'
          : ev.kind === 'toSupergiant' ? 'supergiant' : 'wolfRayet';
        b.starType[i] = starTypeCode(next);
        b.lifespanMyr[i] = age + ev.durationMyr;
        b.phaseAppliedMyr[i] = tPhys;
        const label = next === 'giant' ? '主序耗尽 → 红巨星'
          : next === 'supergiant' ? '主序耗尽 → 红超巨星'
          : '红超巨星包层剥离 → 沃尔夫-拉叶星';
        this.pushStellarEvent({
          t: tPhys,
          bodyId: i,
          text: `${mPhys.toFixed(1)} M☉ ${label}`,
        });
        continue;
      }

      // 遗骸化（白矮星 / 超新星）
      const fromLabel = phase === 'giant' ? '红巨星包层抛射'
        : phase === 'supergiant' ? '红超巨星坍缩' : '沃尔夫-拉叶星坍缩';
      const evt: StellarEvent = {
        t: tPhys,
        bodyId: i,
        text: ev.kind === 'toWhiteDwarf'
          ? `${mPhys.toFixed(1)} M☉ ${fromLabel} → 白矮星`
          : `${mPhys.toFixed(1)} M☉ ${fromLabel} → II 型超新星 → ${ev.remnant === 'blackHole' ? '黑洞' : '中子星'}`,
        remnant: ev.kind === 'supernova' ? ev.remnant : 'whiteDwarf',
      };
      // G3：超新星径向冲量（对称，含爆发体反向补偿 → 总动量守恒）
      if (ev.kind === 'supernova') {
        const ejecta = Math.max(0, physMass(b.mass[i], this.stellar) - 1.4);
        const radiusKick = this.stellar.kickRadius > 0
          ? this.stellar.kickRadius * this.physics.softening
          : 0;
        // J3：冲击波汽化——kickRadius 内的行星/褐矮星/白矮星直接移除（恒星只吃冲量）
        if (radiusKick > 0) {
          const r2Max = radiusKick * radiusKick;
          for (let j = 0; j < b.n; j++) {
            if (j === i || b.mass[j] <= 0) continue;
            const tj = b.starAt(j);
            if (tj !== 'planet' && tj !== 'brownDwarf' && tj !== 'whiteDwarf') continue;
            const dx = b.x[j] - b.x[i];
            const dy = b.y[j] - b.y[i];
            const dz = useZ ? b.z[j] - b.z[i] : 0;
            if (dx * dx + dy * dy + dz * dz >= r2Max) continue;
            const vaporM = physMass(b.mass[j], this.stellar);
            b.mass[j] = 0;
            b.grav[j] = 0;
            this.pushStellarEvent({
              t: tPhys,
              bodyId: j,
              remnant: 'shockwave',
              text: `被冲击波汽化（ΔM=${vaporM.toFixed(2)} M☉）`,
            });
          }
        }
        supernovaKick(
          b.x, b.y, b.z, b.vx, b.vy, b.vz, b.mass, b.n, i,
          ejecta, radiusKick, this.stellar.kickGain,
          this.physics.softening, this.physics.dt, useZ,
        );
        // G3：记录闪光位置（世界坐标 + 出生步）
        this.flashes.push(b.x[i], b.y[i], useZ ? b.z[i] : 0, this.stepCount);
      }
      // 包层对称抛射：遗骸继承原动量 → 速度按质量比放大，总动量守恒
      const oldMass = b.mass[i];
      const ratio = oldMass / Math.max(1e-12, ev.remnantMass);
      b.vx[i] *= ratio;
      b.vy[i] *= ratio;
      b.vz[i] *= ratio;
      b.mass[i] = ev.remnantMass;
      b.grav[i] = ev.remnantMass;
      const remnant = ev.kind === 'toWhiteDwarf' ? 'whiteDwarf' : ev.remnant;
      b.starType[i] = starTypeCode(remnant);
      b.radius[i] = toSimRadius(
        remnantRadiusAu(remnant, ev.remnantMass / massUnit),
        this.stellar.lengthUnit,
      );
      b.explicitRadius[i] = 1;
      b.evolvesFlag[i] = 0;
      b.lifespanMyr[i] = 0;
      b.invalidateGravCache();
      this.accelReady = false;
      this.lastEnergyStep = -9999;
      this.pushStellarEvent(evt);
    }
  }

  /**
   * J4：黑洞潮汐瓦解与持续剥离（开关 accretion && tidalFactor > 0）。
   * r_td = tidalFactor × r_s（按黑洞当前质量实时计算）：
   *  - 行星/褐矮星/白矮星进入 r_td → 整体并入黑洞（动量守恒加权并合）；
   *  - 恒星进入 r_td → 持续剥离（每 Myr 剥当前质量的 1%，剥离部分并入黑洞）。
   */
  private tidalDisruption(dtMyr: number): void {
    if (!this.stellar.accretion || !(this.stellar.tidalFactor > 0) || dtMyr <= 0) return;
    const b = this.bodies;
    const tPhys = physTime(this.time, this.stellar);
    const massUnit = this.stellar.massUnit;
    const useZ = this.physics.dimensions === 3;
    for (let i = 0; i < b.n; i++) {
      if (b.mass[i] <= 0 || b.starAt(i) !== 'blackHole') continue;
      const mPhys = physMass(b.mass[i], this.stellar);
      const rTd = this.stellar.tidalFactor
        * toSimRadius(remnantRadiusAu('blackHole', mPhys), this.stellar.lengthUnit);
      if (!(rTd > 0)) continue;
      const rTd2 = rTd * rTd;
      for (let j = 0; j < b.n; j++) {
        if (j === i || b.mass[j] <= 0) continue;
        const dx = b.x[j] - b.x[i];
        const dy = b.y[j] - b.y[i];
        const dz = useZ ? b.z[j] - b.z[i] : 0;
        if (dx * dx + dy * dy + dz * dz >= rTd2) continue;
        const tj = b.starAt(j);
        const phase = phaseOf(tj);
        const swallowable = tj === 'planet' || tj === 'brownDwarf' || tj === 'whiteDwarf';
        if (phase === null && !swallowable) continue;
        if (phase === null) {
          // 整体并入：动量守恒加权并合（与 G4 碰撞吸积同口径）
          const mj = b.mass[j];
          const mt = b.mass[i] + mj;
          b.vx[i] = (b.vx[i] * b.mass[i] + b.vx[j] * mj) / mt;
          b.vy[i] = (b.vy[i] * b.mass[i] + b.vy[j] * mj) / mt;
          if (useZ) b.vz[i] = (b.vz[i] * b.mass[i] + b.vz[j] * mj) / mt;
          b.mass[i] = mt;
          b.grav[i] = mt;
          b.mass[j] = 0;
          b.grav[j] = 0;
          b.invalidateGravCache();
          this.accelReady = false;
          this.lastEnergyStep = -9999;
          this.pushStellarEvent({
            t: tPhys,
            bodyId: i,
            remnant: 'blackHole',
            text: `潮汐瓦解 · 并入 ΔM=${(mj / massUnit).toFixed(3)} M☉`,
          });
        } else {
          // 恒星持续剥离：每 Myr 剥当前质量的 1%，剥离部分并入黑洞
          const loss = b.mass[j] * windLossFraction(dtMyr, TIDAL_STRIPPING_RATE_PER_MYR);
          if (loss > 0) {
            b.mass[i] += loss;
            b.grav[i] += loss;
            b.mass[j] -= loss;
            b.grav[j] -= loss;
            refreshStarAfterMassChange(b, j, this.stellar, tPhys);
            b.invalidateGravCache();
            this.accelReady = false;
            this.lastEnergyStep = -9999;
            if (tPhys - b.phaseAppliedMyr[j] >= WR_WIND_BATCH_MYR) {
              b.phaseAppliedMyr[j] = tPhys;
              this.pushStellarEvent({
                t: tPhys,
                bodyId: j,
                text: `黑洞潮汐剥离（当前 M=${physMass(b.mass[j], this.stellar).toFixed(2)} M☉）`,
              });
            }
          }
        }
      }
    }
  }

  /**
   * J2：近距双星洛希瓣溢出（简化模型，开关 stellar.transfer）。
   * 触发：间距 < 3×(r1+r2) 且 donor 质量 > 1.2× 伴星；速率 0.05·M_donor Myr⁻¹；
   * 80% 落到 accretor，20% 抛失出系统。
   * 动量简化：转移质量不产生推力（提示词简化模型），抛失质量直接离系统——
   * 系统动量不严格守恒，已在 README「简化模型说明」注明。
   */
  private massTransfer(dtMyr: number): void {
    if (!this.stellar.transfer || dtMyr <= 0) return;
    const b = this.bodies;
    const tPhys = physTime(this.time, this.stellar);
    const massUnit = this.stellar.massUnit;
    const useZ = this.physics.dimensions === 3;
    const list: number[] = [];
    for (let i = 0; i < b.n; i++) {
      if (b.mass[i] <= 0 || !b.evolvesFlag[i]) continue;
      if (neverEvolves(physMass(b.mass[i], this.stellar))) continue;
      list.push(i);
    }
    for (let a = 0; a < list.length; a++) {
      for (let c = a + 1; c < list.length; c++) {
        const i = list[a];
        const j = list[c];
        if (b.mass[i] <= 0 || b.mass[j] <= 0) continue;
        const dx = b.x[j] - b.x[i];
        const dy = b.y[j] - b.y[i];
        const dz = useZ ? b.z[j] - b.z[i] : 0;
        const d2 = dx * dx + dy * dy + dz * dz;
        const rSum = b.radius[i] + b.radius[j];
        if (!(d2 > 0) || !(d2 < TRANSFER_DISTANCE_FACTOR * rSum * (TRANSFER_DISTANCE_FACTOR * rSum))) continue;
        const mi = physMass(b.mass[i], this.stellar);
        const mj = physMass(b.mass[j], this.stellar);
        const donorIsI = mi > mj;
        const donor = donorIsI ? i : j;
        const acc = donorIsI ? j : i;
        const mDonor = donorIsI ? mi : mj;
        const mAcc = donorIsI ? mj : mi;
        if (!(mDonor > TRANSFER_MASS_RATIO * mAcc)) continue;
        const flow = b.mass[donor] * windLossFraction(dtMyr, TRANSFER_RATE_PER_MYR);
        if (!(flow > 0)) continue;
        const toAcc = flow * (1 - TRANSFER_ESCAPE_FRACTION);
        const escaped = flow - toAcc;
        b.mass[donor] -= flow;
        b.grav[donor] -= flow;
        b.mass[acc] += toAcc;
        b.grav[acc] += toAcc;
        refreshStarAfterMassChange(b, donor, this.stellar, tPhys);
        refreshStarAfterMassChange(b, acc, this.stellar, tPhys);
        b.invalidateGravCache();
        this.accelReady = false;
        this.lastEnergyStep = -9999;
        // 事件以 donor 的 phaseAppliedMyr 聚合（与 J1 星风共用该字段，仅影响事件粒度）
        if (tPhys - b.phaseAppliedMyr[donor] >= TRANSFER_EVENT_BATCH_MYR) {
          b.phaseAppliedMyr[donor] = tPhys;
          this.pushStellarEvent({
            t: tPhys,
            bodyId: donor,
            text: `洛希瓣溢出 → #${acc}（转移 ${(flow / massUnit).toFixed(3)} M☉，抛失 ${(escaped / massUnit).toFixed(3)} M☉）`,
          });
        }
      }
    }
  }

  /** D2：Adaptive dt。仅 direct / barnes-hut / treepm 有效。 */
  private computeDt(p: PhysicsParams): number {
    if (!p.adaptiveDt || p.engine === 'particle-mesh') return p.dt;
    let maxA = 0;
    const { ax, ay, az } = this.bodies;
    const useZ = p.dimensions === 3;
    for (let i = 0; i < this.bodies.n; i++) {
      const a = useZ ? Math.hypot(ax[i], ay[i], az[i]) : Math.hypot(ax[i], ay[i]);
      if (a > maxA) maxA = a;
    }
    if (!(maxA > 0)) return p.dt;
    const tau = Math.sqrt(Math.max(1e-12, p.softening) / maxA);
    const target = p.dtSafety * tau;
    const dtMin = p.dt / 64;
    const raw = Math.min(p.dt, Math.max(dtMin, target));
    // 平滑：相邻步变化 < 4 倍
    const prev = this.dtEff > 0 ? this.dtEff : p.dt;
    return Math.min(raw, prev * 4) > prev / 4 ? Math.max(raw, prev / 4) : raw;
  }

  /** A1：运行时增量插入天体，不重建世界。 */
  addBodies(configs: BodyConfig[]): number {
    if (!configs.length) return 0;
    const b = this.bodies;
    const need = b.n + configs.length;
    if (need > b.capacity) b.grow(Math.max(need, b.capacity * 2));
    const useZ = this.physics.dimensions === 3;
    for (const c of configs) {
      const i = b.n++;
      b.mass[i] = c.mass;
      b.grav[i] = c.grav ?? c.mass;
      b.x[i] = c.x;
      b.y[i] = c.y;
      b.z[i] = useZ ? (c.z ?? 0) : 0;
      b.vx[i] = c.vx;
      b.vy[i] = c.vy;
      b.vz[i] = useZ ? (c.vz ?? 0) : 0;
      b.ax[i] = b.ay[i] = b.az[i] = 0;
      if (c.radius !== undefined) {
        b.radius[i] = c.radius;
        b.explicitRadius[i] = 1;
      } else {
        b.radius[i] = this.physics.bodyRadius * Math.cbrt(Math.max(0, c.mass));
        b.explicitRadius[i] = 0;
      }
      applyStarConfig(b, i, c, this.stellar, physTime(this.time, this.stellar));
    }
    b.requested += configs.length;
    this.strategy = resolveStrategy(b.requested, this.physics, this.view);
    const verts = Math.max(5, this.strategy.renderCount * 5);
    if (this.vertexBuf.length < verts) this.vertexBuf = new Float32Array(verts);
    this.accelReady = false;
    b.invalidateGravCache();
    this.lastEnergyStep = -9999;
    this.lastDynStep = -9999;
    return configs.length;
  }

  /** A2：按当前快照索引删除天体（swap-remove）。 */
  removeBody(index: number): boolean {
    const b = this.bodies;
    if (!Number.isInteger(index) || index < 0 || index >= b.n) return false;
    // 快照索引 → 实际 SoA 索引：用 renderStride 映射
    const actual = Math.min(b.n - 1, index * this.strategy.renderStride);
    const last = b.n - 1;
    if (actual !== last) {
      b.mass[actual] = b.mass[last];
      b.grav[actual] = b.grav[last];
      b.x[actual] = b.x[last];
      b.y[actual] = b.y[last];
      b.z[actual] = b.z[last];
      b.vx[actual] = b.vx[last];
      b.vy[actual] = b.vy[last];
      b.vz[actual] = b.vz[last];
      b.radius[actual] = b.radius[last];
      b.explicitRadius[actual] = b.explicitRadius[last];
    }
    b.n = last;
    b.requested = Math.max(1, b.requested - 1);
    this.strategy = resolveStrategy(b.requested, this.physics, this.view);
    this.accelReady = false;
    this.lastEnergyStep = -9999;
    this.lastDynStep = -9999;
    this.resetTrails();
    return true;
  }

  /** C3：移除质心漂移。 */
  removeDrift(centerPosition: boolean): void {
    this.bodies.zeroMomentum();
    if (centerPosition) this.bodies.centerAtOrigin();
    this.lastDynStep = -9999;
  }

  /** F4：势场密度切片（PM / TreePM 可用）。 */
  fieldSlice(): { data: Float32Array; size: number } | null {
    const solver = this.solver as unknown as { densitySlice?: () => { data: Float32Array; size: number } };
    return solver.densitySlice ? solver.densitySlice() : null;
  }

  /** F2：导出轨迹（环形缓冲按时间顺序展开）。 */
  trailData(indices: number[]): { filled: number; points: number; data: Float32Array } {
    const tx = this.trailX;
    const ty = this.trailY;
    const tz = this.trailZ;
    if (!tx || !ty || !tz) return { filled: 0, points: 0, data: new Float32Array(0) };
    const points = this.trailPoints;
    const filled = this.trailFilled;
    const data = new Float32Array(indices.length * filled * 3);
    let o = 0;
    for (const idx of indices) {
      if (idx < 0 || idx >= this.trailCount) continue;
      for (let k = 0; k < filled; k++) {
        const slot = (this.trailHead - filled + k + points) % points;
        const src = slot * this.trailCount + idx;
        data[o++] = tx[src];
        data[o++] = ty[src];
        data[o++] = tz[src];
      }
    }
    return { filled, points, data };
  }

  private refreshDynamics(): ReturnType<typeof computeDynamics> {
    if (this.dynamics && this.stepCount - this.lastDynStep < 4) return this.dynamics;
    this.lastDynStep = this.stepCount;
    const escape = this.physics.escapeRadius > 0
      ? this.physics.escapeRadius
      : this.init.radius * 10;
    this.dynamics = computeDynamics(
      this.bodies,
      this.physics.G,
      this.physics.softening,
      escape,
    );
    return this.dynamics;
  }

  private compactIfNeeded(): void {
    const n = this.bodies.n;
    let dead = 0;
    for (let i = 0; i < n; i++) if (this.bodies.mass[i] <= 0) dead++;
    if (dead < Math.max(32, n * 0.12)) return;
    this.bodies.removeDead();
    this.accelReady = false;
    this.lastEnergyStep = -9999;
    this.resetTrails();
  }

  private refreshEnergy(): EnergyBreakdown | null {
    if (this.stepCount - this.lastEnergyStep < 6 && this.energy) return this.energy;
    this.lastEnergyStep = this.stepCount;
    this.energy = computeEnergy(this.bodies, this.physics.G, this.physics.softening);
    return this.energy;
  }

  diagnostics(): Diagnostics {
    const energy = this.refreshEnergy();
    const dyn = this.refreshDynamics();
    const drift =
      energy && this.initialEnergy !== null && Math.abs(this.initialEnergy) > 1e-12
        ? (energy.total - this.initialEnergy) / Math.abs(this.initialEnergy)
        : null;
    const report = this.solver.report();

    return {
      step: this.stepCount,
      time: this.time,
      simulated: this.bodies.n,
      requested: this.strategy.requested,
      engine: this.strategy.engine,
      dimensions: this.physics.dimensions,
      stepMs: this.lastStepMs,
      collisions: this.contactTotal,
      merged: this.mergedTotal,
      kinetic: energy ? energy.kinetic : Number.NaN,
      potential: energy ? energy.potential : Number.NaN,
      totalEnergy: energy ? energy.total : Number.NaN,
      energyDrift: drift,
      escaped: report.escaped,
      virial: dyn.virial,
      escapeCount: dyn.escapeCount,
      comSpeed: dyn.comSpeed,
      comX: dyn.comX,
      comY: dyn.comY,
      comZ: dyn.comZ,
      dtEff: this.dtEff || this.physics.dt,
      msForce: this.msForceEma,
      msIntegrate: this.msIntegrateEma,
      msCollision: this.msCollisionEma,
      angularMomentum: dyn.angularMomentum,
      momentum: dyn.momentum,
      physTimeMyr: physTime(this.time, this.stellar),
      evolutionEvents: this.stellarEvents.length,
    };
  }

  /** C1：诊断采样（供 Worker 推帧）。 */
  metricsSample(): MetricsSample {
    const d = this.diagnostics();
    return {
      step: d.step,
      time: d.time,
      kinetic: d.kinetic,
      potential: d.potential,
      total: d.totalEnergy,
      angularMomentum: d.angularMomentum,
      momentum: d.momentum,
      drift: d.energyDrift,
      virial: d.virial,
      escapeCount: d.escapeCount,
      comSpeed: d.comSpeed,
      dtEff: d.dtEff,
    };
  }

  perfSample(): PerfSample {
    const d = this.diagnostics();
    return {
      step: d.step,
      ms: d.stepMs,
      force: d.msForce,
      integrate: d.msIntegrate,
      collision: d.msCollision,
      simulated: d.simulated,
      engine: d.engine,
    };
  }

  /** 生成渲染快照：五分量顶点、三维包围盒、三维轨迹。 */
  snapshot(): Snapshot {
    const renderCount = this.strategy.renderCount;
    const renderStride = this.strategy.renderStride;
    const vertex = this.vertexBuf;
    const { x, y, z, vx, vy, vz, mass } = this.bodies;
    const useZ = this.physics.dimensions === 3;
    const mode = this.view.colorMode;
    const com = mode === 'radius' || useZ ? this.bodies.centerOfMass() : null;
    const stellarMode = mode === 'stellar';

    let count = 0;
    let sMin = Infinity;
    let sMax = -Infinity;
    let mMin = Infinity;
    let mMax = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    let sumZ2 = 0;

    for (let i = 0; i < this.bodies.n && count < renderCount; i += renderStride) {
      if (mass[i] <= 0) continue;
      const px = x[i];
      const py = y[i];
      const pz = useZ ? z[i] : 0;
      let scalar: number;
      if (stellarMode) scalar = this.bodies.starType[i]; // G5：直接编码类型码，不做归一化
      else if (mode === 'speed') scalar = Math.hypot(vx[i], vy[i], useZ ? vz[i] : 0);
      else if (mode === 'mass') scalar = mass[i];
      else scalar = Math.hypot(px - com!.x, py - com!.y, useZ ? pz - com!.z : 0);

      const o = count * 5;
      vertex[o] = px;
      vertex[o + 1] = py;
      vertex[o + 2] = pz;
      vertex[o + 3] = scalar;
      vertex[o + 4] = mass[i];

      if (scalar < sMin) sMin = scalar;
      if (scalar > sMax) sMax = scalar;
      if (mass[i] < mMin) mMin = mass[i];
      if (mass[i] > mMax) mMax = mass[i];
      sumX += px;
      sumY += py;
      sumZ += pz;
      sumX2 += px * px;
      sumY2 += py * py;
      sumZ2 += pz * pz;
      count++;
    }

    if (count === 0) {
      sMin = 0;
      sMax = 1;
      mMin = 0;
      mMax = 1;
    }

    const sRange = sMax - sMin || 1;
    const mRange = mMax - mMin || 1;
    const HB = 64;
    if (this.histX.length !== HB) {
      this.histX = new Int32Array(HB);
      this.histY = new Int32Array(HB);
      this.histZ = new Int32Array(HB);
    }
    this.histX.fill(0);
    this.histY.fill(0);
    this.histZ.fill(0);

    const meanX = count ? sumX / count : 0;
    const meanY = count ? sumY / count : 0;
    const meanZ = count ? sumZ / count : 0;
    const sigmaX = Math.sqrt(Math.max(0, (count ? sumX2 / count : 0) - meanX * meanX));
    const sigmaY = Math.sqrt(Math.max(0, (count ? sumY2 / count : 0) - meanY * meanY));
    const sigmaZ = Math.sqrt(Math.max(0, (count ? sumZ2 / count : 0) - meanZ * meanZ));
    const spanX = Math.max(6 * sigmaX, 1e-3);
    const spanY = Math.max(6 * sigmaY, 1e-3);
    const spanZ = Math.max(6 * sigmaZ, 1e-3);
    const loX = meanX - 3 * sigmaX;
    const loY = meanY - 3 * sigmaY;
    const loZ = meanZ - 3 * sigmaZ;

    // G1/H2：恒星类型数组提前生成（与 vertex 同步），供光谱配色与相位尺寸倍率使用
    let starTypes: Uint8Array | null = null;
    if (count > 0) {
      starTypes = new Uint8Array(count);
      let k = 0;
      for (let i = 0; i < this.bodies.n && k < count; i += renderStride) {
        if (this.bodies.mass[i] <= 0) continue;
        starTypes[k++] = this.bodies.starType[i];
      }
    }

    for (let k = 0; k < count; k++) {
      const o = k * 5;
      if (!stellarMode) vertex[o + 3] = (vertex[o + 3] - sMin) / sRange;
      const massNorm = (vertex[o + 4] - mMin) / mRange;
      vertex[o + 4] = 0.72 + 0.72 * massNorm;
      // H2：光谱配色下，相位/褐矮星按类型缩放点大小（红巨星 ×6、红超巨星 ×14、WR ×3、褐矮星 ×0.8）
      if (stellarMode && starTypes) {
        vertex[o + 4] *= starSizeMul(STAR_TYPE_CODES[starTypes[k]] ?? 'planet');
      }

      const bx = Math.min(HB - 1, Math.max(0, Math.floor(((vertex[o] - loX) / spanX) * HB)));
      const by = Math.min(HB - 1, Math.max(0, Math.floor(((vertex[o + 1] - loY) / spanY) * HB)));
      const bz = Math.min(HB - 1, Math.max(0, Math.floor(((vertex[o + 2] - loZ) / spanZ) * HB)));
      this.histX[bx]++;
      this.histY[by]++;
      this.histZ[bz]++;
    }

    const [rx0, rx1] = percentileBounds(this.histX, count, loX, spanX, HB);
    const [ry0, ry1] = percentileBounds(this.histY, count, loY, spanY, HB);
    const [rz0, rz1] = percentileBounds(this.histZ, count, loZ, spanZ, HB);
    const bounds3: [number, number, number, number, number, number] = [
      rx0, ry0, rz0, rx1, ry1, rz1,
    ];

    this.recordTrails();

    // G3：闪光缓冲
    let flashes: Float32Array | null = null;
    if (this.flashes.length > 0) {
      flashes = Float32Array.from(this.flashes);
    }

    // 少体模式：附带实时速度，供状态表与轨道要素使用
    let velocities: Float32Array | null = null;
    if (count > 0 && count <= 10) {
      velocities = new Float32Array(count * 3);
      let k = 0;
      for (let i = 0; i < this.bodies.n && k < count; i += renderStride) {
        if (this.bodies.mass[i] <= 0) continue;
        velocities[k * 3] = this.bodies.vx[i];
        velocities[k * 3 + 1] = this.bodies.vy[i];
        velocities[k * 3 + 2] = this.bodies.vz[i];
        k++;
      }
    }

    let traj: Float32Array | null = null;
    if (this.trailCount > 0 && this.trailX && this.trailY && this.trailZ) {
      const points = this.trailPoints;
      traj = new Float32Array(this.trailCount * points * 3);
      for (let i = 0; i < this.trailCount; i++) {
        const base = i * points * 3;
        for (let k = 0; k < points; k++) {
          const src = k * this.trailCount + i;
          traj[base + k * 3] = this.trailX[src];
          traj[base + k * 3 + 1] = this.trailY[src];
          traj[base + k * 3 + 2] = this.trailZ[src];
        }
      }
    }

    return {
      count,
      requested: this.strategy.requested,
      simulated: this.bodies.n,
      weight: this.strategy.weight,
      dimensions: this.physics.dimensions,
      vertex,
      velocities,
      starTypes,
      flashes,
      step: this.stepCount,
      scalarMin: sMin,
      scalarMax: sMax,
      bounds: [rx0, ry0, rx1, ry1],
      bounds3,
      trajectories: traj,
      trajectoryCount: traj ? this.trailCount : 0,
      trajectoryPoints: this.trailPoints,
      trajectoryHead: this.trailHead,
      trajectoryFilled: this.trailFilled,
    };
  }

  get aliveCount(): number {
    let c = 0;
    for (let i = 0; i < this.bodies.n; i++) if (this.bodies.mass[i] > 0) c++;
    return c;
  }
}

/** 从逐体配置构造 BodySet（不做任何质量归一或随机化）。 */
function buildFromConfigs(
  configs: BodyConfig[],
  simulated: number,
  weight: number,
  physics: PhysicsParams,
  stellar: StellarConfig,
): BodySet {
  const n = Math.min(configs.length, simulated);
  const b = new BodySet(n, weight, configs.length, physics.dimensions);
  const useZ = physics.dimensions === 3;
  for (let i = 0; i < n; i++) {
    const c = configs[i];
    b.mass[i] = c.mass;
    b.grav[i] = c.grav ?? c.mass;
    b.x[i] = c.x;
    b.y[i] = c.y;
    b.z[i] = useZ ? c.z ?? 0 : 0;
    b.vx[i] = c.vx;
    b.vy[i] = c.vy;
    b.vz[i] = useZ ? c.vz ?? 0 : 0;
    if (c.radius !== undefined) {
      b.radius[i] = c.radius;
      b.explicitRadius[i] = 1;
    }
    applyStarConfig(b, i, c, stellar, 0);
    // G4：遗骸碰撞半径用物理值（与显示半径解耦）
    const st = b.starAt(i);
    if (st === 'whiteDwarf' || st === 'neutronStar' || st === 'blackHole') {
      b.radius[i] = toSimRadius(remnantRadiusAu(st, c.mass / stellar.massUnit), stellar.lengthUnit);
      b.explicitRadius[i] = 1;
    }
  }
  b.refreshRadii(physics.bodyRadius);
  b.markGravConfigured();
  return b;
}

function percentileBounds(
  hist: Int32Array,
  total: number,
  min: number,
  span: number,
  bins: number,
): [number, number] {
  if (total <= 0) return [min, min + span];
  const target = total * 0.01;
  let acc = 0;
  let lo = 0;
  for (let i = 0; i < bins; i++) {
    acc += hist[i];
    if (acc >= target) {
      lo = i;
      break;
    }
  }
  acc = 0;
  let hi = bins - 1;
  for (let i = bins - 1; i >= 0; i--) {
    acc += hist[i];
    if (acc >= target) {
      hi = i;
      break;
    }
  }
  const w0 = min + (span * lo) / bins;
  const w1 = min + (span * (hi + 1)) / bins;
  return w1 > w0 ? [w0, w1] : [min, min + span];
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
