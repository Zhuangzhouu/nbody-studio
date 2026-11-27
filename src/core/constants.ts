/**
 * 常量与默认值。
 *
 * 这里的规模数字只是「auto 模式的默认建议」，不再是硬性上限：
 * 用户可在 JSON 配置中把采样、渲染、轨迹、碰撞等限制关闭或调高（风险自负）。
 */

/** 界面允许输入的最大天体数量（INT_MAX）。 */
export const MAX_BODY_INPUT = 2_147_483_647;

/** auto 引擎：直接求和建议上限。 */
export const DIRECT_MAX = 2_048;

/** auto 引擎：Barnes-Hut 建议上限。 */
export const BARNES_HUT_MAX = 20_000;

/** auto 采样：默认逐体积分上限（0 表示不限）。 */
export const SIM_CAP = 2_000_000;

/** 默认渲染点数上限（0 表示不限）。 */
export const RENDER_CAP = 250_000;

/** 默认轨迹天体数（0 表示不限）。 */
export const TRAIL_MAX = 400;

/** 默认轨迹历史点数。 */
export const TRAIL_POINTS = 48;

/** 碰撞检测建议提示阈值（超过仅提示，不关闭）。 */
export const COLLISION_MAX = 30_000;

/** PM 网格默认分辨率（每轴格数，2 的幂）。 */
export const PM_GRID = 64;

/** 中小规模 PM 使用的低分辨率网格。 */
export const PM_GRID_SMALL = 32;

/** 低于该规模时 auto 使用低分辨率网格。 */
export const PM_SMALL_MAX = 250_000;
