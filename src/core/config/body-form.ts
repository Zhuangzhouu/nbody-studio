/**
 * 逐条天体数据编辑的纯校验层。
 *
 * UI 表单使用字符串值（用户可能输入空串、字母、科学计数法），这里把它转换成
 * 可信的 BodyConfig，并返回逐字段错误。不依赖 DOM，可在 Node 中直接测试。
 */

import type { BodyConfig, Dimensions } from '../types';

/** 表单中的一条原始输入（全部是字符串，便于显示用户输入）。 */
export interface BodyDraft {
  id: string;
  x: string;
  y: string;
  z: string;
  vx: string;
  vy: string;
  vz: string;
  mass: string;
  grav: string;
  radius: string;
}

export interface BodyDraftValidation {
  ok: boolean;
  body: BodyConfig | null;
  /** 字段名 → 错误信息。 */
  errors: Record<string, string>;
}

export const EMPTY_DRAFT: BodyDraft = {
  id: '',
  x: '0',
  y: '0',
  z: '0',
  vx: '0',
  vy: '0',
  vz: '0',
  mass: '1',
  grav: '',
  radius: '',
};

/** BodyConfig → 表单值。 */
export function bodyToDraft(body: BodyConfig): BodyDraft {
  return {
    id: body.id === undefined ? '' : String(body.id),
    x: String(body.x),
    y: String(body.y),
    z: String(body.z ?? 0),
    vx: String(body.vx),
    vy: String(body.vy),
    vz: String(body.vz ?? 0),
    mass: String(body.mass),
    grav: body.grav === undefined ? '' : String(body.grav),
    radius: body.radius === undefined ? '' : String(body.radius),
  };
}

/**
 * 校验一条表单输入。
 *
 * @param draft 表单原始值
 * @param dimensions 2D 时 z/vz 强制为 0
 * @param usedIds 已被其它条目占用的 id（用于唯一性校验）
 */
export function validateBodyDraft(
  draft: BodyDraft,
  dimensions: Dimensions,
  usedIds: ReadonlySet<number> = new Set(),
): BodyDraftValidation {
  const errors: Record<string, string> = {};

  const parseNumber = (key: keyof BodyDraft, required: boolean): number | null => {
    const raw = String(draft[key] ?? '').trim();
    if (raw === '') {
      if (required) errors[key] = '必填';
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors[key] = '必须是有限数字';
      return null;
    }
    return value;
  };

  const idRaw = String(draft.id ?? '').trim();
  let id: number | undefined;
  if (idRaw !== '') {
    const parsed = Number(idRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.id = 'id 必须是非负整数';
    } else if (usedIds.has(parsed)) {
      errors.id = `id ${parsed} 已被其它天体占用`;
    } else {
      id = parsed;
    }
  }

  const x = parseNumber('x', true);
  const y = parseNumber('y', true);
  const vx = parseNumber('vx', true);
  const vy = parseNumber('vy', true);
  const mass = parseNumber('mass', true);
  const z = dimensions === 3 ? parseNumber('z', true) : 0;
  const vz = dimensions === 3 ? parseNumber('vz', true) : 0;
  const gravRaw = String(draft.grav ?? '').trim() === '' ? null : parseNumber('grav', false);
  const radiusRaw = String(draft.radius ?? '').trim() === '' ? null : parseNumber('radius', false);
  const grav = gravRaw === null ? undefined : gravRaw;
  const radius = radiusRaw === null ? undefined : radiusRaw;

  if (mass !== null && mass <= 0) errors.mass = '质量必须大于 0';
  if (grav !== undefined && grav <= 0) errors.grav = '引力质量必须大于 0';
  if (radius !== undefined && radius < 0) errors.radius = '碰撞半径不能为负';

  if (
    Object.keys(errors).length > 0 ||
    x === null || y === null || vx === null || vy === null || mass === null ||
    z === null || vz === null
  ) {
    return { ok: false, body: null, errors };
  }

  const body: BodyConfig = {
    ...(id !== undefined ? { id } : {}),
    x,
    y,
    z: z ?? 0,
    vx,
    vy,
    vz: vz ?? 0,
    mass,
    ...(grav !== undefined ? { grav } : {}),
    ...(radius !== undefined ? { radius } : {}),
  };

  return { ok: true, body, errors: {} };
}

/** 为表单生成“下一条”的默认 id。 */
export function nextId(bodies: readonly BodyConfig[]): number {
  let max = -1;
  for (const b of bodies) max = Math.max(max, b.id ?? -1);
  return max + 1;
}
