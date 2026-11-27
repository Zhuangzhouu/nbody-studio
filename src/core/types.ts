/** 物理与界面共用的数据契约（支持 2D / 3D 与逐体引力参数）。 */

export type Dimensions = 2 | 3;

/** 恒星类型：'auto' 仅出现在配置里，运行时由质量推导为具体光谱型。 */
export type StarType =
  | 'auto' | 'planet' | 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'
  | 'whiteDwarf' | 'neutronStar' | 'blackHole'
  /** H1：褐矮星 0.013–0.45 M☉，可显式指定，也由 auto 推导；永驻不演化。 */
  | 'brownDwarf';

/**
 * H2/H3：主序后的演化相位（红巨星 / 红超巨星 / 沃尔夫-拉叶星）。
 * 仅存在于运行时状态机与 SoA 编码，配置层 StarType 不含这三者，校验层拒收。
 */
export type PhaseType = 'giant' | 'supergiant' | 'wolfRayet';

/** 运行时可出现在 SoA starType 的完整类型集合（配置类型 + 演化相位）。 */
export type RuntimeStarType = Exclude<StarType, 'auto'> | PhaseType;

/** advanceEvolution 的相位参数：'ms' 为主序，其余为主序后相位。 */
export type EvolutionPhase = 'ms' | PhaseType;

/** 恒星单位标定：massUnit 个模拟质量 = 1 M☉；timeUnit 个模拟时间 = 1 Myr。 */
export interface StellarConfig {
  massUnit: number;
  timeUnit: number;
  /** G4：多少个模拟长度 = 1 AU。 */
  lengthUnit: number;
  /** G3：超新星冲量半径（softening 倍数）；0 = 关闭冲量与冲击波汽化。 */
  kickRadius: number;
  /** G3：冲量增益。 */
  kickGain: number;
  /** G4：黑洞吸积开关。 */
  accretion: boolean;
  /** J1：大质量主序星（>8 M☉）星风质量流失开关。 */
  wind: boolean;
  /** J2：近距双星质量转移开关（洛希瓣溢出简化模型）。 */
  transfer: boolean;
  /** J4：黑洞潮汐瓦解半径系数 r_td = tidalFactor × r_s；0 = 关闭潮汐瓦解。 */
  tidalFactor: number;
}

/** 单体的恒星配置。type 省略或 'auto' 表示按质量推导并参与演化。 */
export interface StarConfig {
  type?: StarType;
  /** 初始年龄，单位 timeUnit（模拟时间），默认 0。 */
  age?: number;
}

export type EngineKind = 'direct' | 'barnes-hut' | 'particle-mesh' | 'treepm';

/** auto 由规模策略决定；其余为强制指定（用户可自行承担性能代价）。 */
export type EnginePreference = 'auto' | EngineKind;

/** auto：超过 maxSimulated 时采样；never：绝不采样（内存与算力用户自担）；always：始终采样。 */
export type SamplingMode = 'auto' | 'never' | 'always';

export type IntegratorKind = 'verlet' | 'rk4' | 'yoshida4';

export type CollisionMode = 'none' | 'merge' | 'bounce';

export type DistributionKind =
  | 'disc'
  | 'cloud'
  | 'cluster'
  | 'collision'
  | 'grid'
  | 'binary';

export type ColorMode = 'speed' | 'mass' | 'radius' | 'stellar';

/** 力学与积分参数。所有精度/规模旋钮都在此，不设隐藏的硬限制。 */
export interface PhysicsParams {
  /** 维度：2 = z 恒为 0；3 = 完整 x/y/z 运动。 */
  dimensions: Dimensions;
  /** 引力常数 G（任意单位，默认 1）。 */
  G: number;
  /** 时间步长。 */
  dt: number;
  /** 软化长度 ε，避免近距奇点。 */
  softening: number;
  /** Barnes-Hut 开角 θ，越小越精确。 */
  theta: number;
  integrator: IntegratorKind;
  collision: CollisionMode;
  /** 弹性恢复系数 0..1（bounce 模式）。 */
  restitution: number;
  /** 碰撞半径基准（以质量换算体半径的密度参数）。 */
  bodyRadius: number;

  /** 引擎选择：auto 或强制某一种。 */
  engine: EnginePreference;
  /** 采样策略。 */
  sampling: SamplingMode;
  /** auto 模式下的逐体积分上限；0 = 不设上限。 */
  maxSimulated: number;
  /** PM 网格每轴格数（2 的幂）；0 = 按规模自动选择。 */
  pmGrid: number;
  /** D2：近距离交会时自适应缩小步长。 */
  adaptiveDt: boolean;
  /** D2：安全系数 (0,1]，默认 0.3。 */
  dtSafety: number;
  /** C4：逃逸半径（相对系统尺度）；0 = 自动取 init.radius×10。 */
  escapeRadius: number;
  /** D3：TreePM 的近/远场分界（以 PM 网格距 h 为单位）。 */
  rSplitGrids: number;
}

/** 初始条件参数。 */
export interface InitParams {
  /** 用户请求的天体数量。 */
  count: number;
  distribution: DistributionKind;
  /** 系统特征半径。 */
  radius: number;
  massMin: number;
  massMax: number;
  /** 归一化后的系统总质量（保证不同 N 下轨道时间尺度一致）。 */
  totalMass: number;
  /** 是否把质量重新标定到 totalMass。 */
  normalizeMass: boolean;
  /** 盘状分布的旋转比例，1 = 圆轨道速度。 */
  spin: number;
  /** 位置抖动比例，增加非对称性。 */
  jitter: number;
  /** 3D 盘/云在 z 方向的厚度比例（相对 radius）。 */
  thickness: number;
  seed: number;
}

/** 显示参数。 */
export interface ViewParams {
  trails: boolean;
  trailLength: number;
  /** 记录轨迹的天体数量；0 = 跟随实际天体数（内存用户自担）。 */
  trailBodies: number;
  /** 每体历史点数（越大内存越高）。 */
  trailPoints: number;
  /** 每帧最多绘制的点数；0 = 不抽样（全部绘制）。 */
  maxRenderPoints: number;
  colorMode: ColorMode;
  pointSize: number;
  glow: boolean;
  showGrid: boolean;
}

/** 运行参数。 */
export interface RunParams {
  playing: boolean;
  /** 每帧推进的物理步数倍率。 */
  speed: number;
}

/** JSON 配置中的单个天体：位置/速度/质量/引力参数/碰撞半径均可完整指定。 */
export interface BodyConfig {
  /** 可选稳定标识，仅用于回显，不影响物理。 */
  id?: number;
  x: number;
  y: number;
  /** 2D 模式可省略，默认 0。 */
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  /** 惯性质量（影响动能、碰撞与并合）。 */
  mass: number;
  /** 引力质量 μ/G：不填则等于 mass；可独立设置以模拟非等效原理场景。 */
  grav?: number;
  /** 碰撞半径；不填则由 mass 与 bodyRadius 换算。 */
  radius?: number;
  /** 恒星配置（G 组）。省略 = 按质量自动分类的 auto 体。 */
  star?: StarConfig;
}

/** 完整模拟配置：可序列化为 JSON，也可从 JSON 还原。 */
export interface SimulationConfig {
  schema: 'nbody-studio/v2';
  version: 2;
  meta?: {
    name?: string;
    createdAt?: string;
    note?: string;
  };
  dimensions: Dimensions;
  physics: PhysicsParams;
  init: InitParams;
  view: ViewParams;
  run: RunParams;
  /** 恒星物理单位标定（G 组，可选；缺省用默认值）。 */
  stellar?: StellarConfig;
  /**
   * 显式天体列表。存在且非空时完全替代生成器：每个天体的全部字段都由配置决定。
   * 省略时使用 init 中的程序化初始条件。
   */
  bodies?: BodyConfig[];
}

/** 单帧提交给渲染层的采样快照。 */
export interface Snapshot {
  /** 绘制点数量。 */
  count: number;
  /** 请求的天体数（原始输入）。 */
  requested: number;
  /** 实际积分的天体数。 */
  simulated: number;
  /** 采样权重（1 表示真实逐一模拟）。 */
  weight: number;
  /** 维度。 */
  dimensions: Dimensions;
  /** 交错的顶点数据：[x, y, z, scalar, size] × count。 */
  vertex: Float32Array;
  /** 少量天体的实时速度 [vx,vy,vz] × count；大规模时为 null。 */
  velocities: Float32Array | null;
  /** 恒星类型枚举（与 vertex 顺序一致）；无恒星数据时为 null。 */
  starTypes: Uint8Array | null;
  /** G3：本帧闪光 [x,y,z,birthStep] × n。 */
  flashes: Float32Array | null;
  /** 当前物理步数（闪光步龄用）。 */
  step: number;
  /** 颜色标量归一化区间。 */
  scalarMin: number;
  scalarMax: number;
  /** 世界坐标包围盒（x/y），兼容 2D 视图。 */
  bounds: [number, number, number, number];
  /** 三维包围盒 [minX,minY,minZ,maxX,maxY,maxZ]。 */
  bounds3: [number, number, number, number, number, number];
  /** 轨迹采样：[x,y,z] × points × bodies。 */
  trajectories: Float32Array | null;
  trajectoryCount: number;
  trajectoryPoints: number;
  /** 环形缓冲的写入位置（最新点在 head-1）。 */
  trajectoryHead: number;
  /** 已填充的历史点数（从 0 增长到 trajectoryPoints）。 */
  trajectoryFilled: number;
}

/** 诊断统计。 */
export interface Diagnostics {
  step: number;
  time: number;
  simulated: number;
  requested: number;
  engine: EngineKind;
  dimensions: Dimensions;
  /** 单次力计算（一步）耗时，毫秒。 */
  stepMs: number;
  collisions: number;
  merged: number;
  kinetic: number;
  potential: number;
  totalEnergy: number;
  /** 相对初始总能量的漂移（仅小 N 精确计算时可用）。 */
  energyDrift: number | null;
  /** 逃逸出网格/边界的天体数（PM 引擎时提示精度损失）。 */
  escaped: number;
  /** C4：维里比率 2K/|U|。 */
  virial: number | null;
  /** C4：按 escapeRadius 统计的逃逸体数。 */
  escapeCount: number;
  /** C3：质心速度模长。 */
  comSpeed: number;
  /** C3：质心坐标。 */
  comX: number;
  comY: number;
  comZ: number;
  /** D2：本步实际使用的时间步长。 */
  dtEff: number;
  /** E4：耗时分段（毫秒，指数平滑）。 */
  msForce: number;
  msIntegrate: number;
  msCollision: number;
  /** 动能/势能/角动量/动量（供 C1 曲线）。 */
  angularMomentum: number;
  momentum: number;
  /** G 组：物理时间（Myr）与已演化事件数。 */
  physTimeMyr: number;
  evolutionEvents: number;
}


/** C1：诊断曲线采样点。 */
export interface MetricsSample {
  step: number;
  time: number;
  kinetic: number;
  potential: number;
  total: number;
  angularMomentum: number;
  momentum: number;
  drift: number | null;
  virial: number | null;
  escapeCount: number;
  comSpeed: number;
  dtEff: number;
}

/** E4：性能分段。 */
export interface PerfSample {
  step: number;
  ms: number;
  force: number;
  integrate: number;
  collision: number;
  simulated: number;
  engine: EngineKind;
}


/** I1：事件时刻的恒星快照（供信息卡渲染，全部物理口径）。 */
export interface StarCardInfo {
  /** 运行时类型（含相位），信息卡取色/文案用。 */
  type: string;
  /** 物理质量 M☉。 */
  massPhys: number;
  /** 物理年龄 Myr。 */
  ageMyr: number;
  /** 当前相位的结束时刻（物理 Myr）；主序相 = t_MS。 */
  phaseEndMyr: number;
  /** 相位名（主序 / 红巨星 / 红超巨星 / 沃尔夫-拉叶 / 遗骸）。 */
  phase: string;
}

/** G2/G3：恒星演化事件（Worker → 主线程）。 */
export interface StellarEvent {
  /** 物理时间 Myr。 */
  t: number;
  bodyId: number;
  /** 事件文案，如「II 型超新星 → 中子星」。 */
  text: string;
  /** 遗骸类型（G5 闪光与徽标用）。 */
  remnant?: string;
  /** I1：事件时刻该体的恒星快照（信息卡用）。 */
  star?: StarCardInfo;
}
