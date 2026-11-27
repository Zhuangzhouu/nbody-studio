import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  bodyToDraft,
  nextId,
  validateBodyDraft,
  type BodyDraft,
} from '../src/core/config/body-form';

const draft = (patch: Partial<BodyDraft> = {}): BodyDraft => ({ ...EMPTY_DRAFT, ...patch });

describe('逐条数据表单校验', () => {
  it('接受一条完整的 3D 数据', () => {
    const r = validateBodyDraft(
      draft({ id: '7', x: '1.5', y: '-2', z: '3', vx: '0.1', vy: '-0.2', vz: '0.3', mass: '2', grav: '5', radius: '0.4' }),
      3,
    );
    expect(r.ok).toBe(true);
    expect(r.body).toEqual({
      id: 7,
      x: 1.5,
      y: -2,
      z: 3,
      vx: 0.1,
      vy: -0.2,
      vz: 0.3,
      mass: 2,
      grav: 5,
      radius: 0.4,
    });
  });

  it('省略 grav/radius 时不写入字段', () => {
    const r = validateBodyDraft(draft({ x: '1', y: '2', mass: '3' }), 3);
    expect(r.ok).toBe(true);
    expect(r.body?.grav).toBeUndefined();
    expect(r.body?.radius).toBeUndefined();
    expect(r.body?.z).toBe(0);
  });

  it('2D 模式强制 z/vz 为 0 且忽略其非法输入', () => {
    const r = validateBodyDraft(draft({ x: '1', y: '2', z: 'oops', vz: 'abc', mass: '1' }), 2);
    expect(r.ok).toBe(true);
    expect(r.body?.z).toBe(0);
    expect(r.body?.vz).toBe(0);
  });

  it('逐字段报告错误：非数字、空值、负质量、负半径', () => {
    const r = validateBodyDraft(
      draft({ x: '', y: 'abc', mass: '-1', grav: '0', radius: '-2', vx: 'NaN' }),
      3,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.x).toContain('必填');
    expect(r.errors.y).toContain('有限数字');
    expect(r.errors.vx).toContain('有限数字');
    expect(r.errors.mass).toContain('大于 0');
    expect(r.errors.grav).toContain('大于 0');
    expect(r.errors.radius).toContain('不能为负');
  });

  it('拒绝非法或重复 id', () => {
    expect(validateBodyDraft(draft({ id: '1.5' }), 3).errors.id).toContain('整数');
    expect(validateBodyDraft(draft({ id: '-2' }), 3).errors.id).toContain('非负');
    expect(
      validateBodyDraft(draft({ id: '5' }), 3, new Set([5])).errors.id,
    ).toContain('占用');
  });

  it('科学计数法可接受', () => {
    const r = validateBodyDraft(draft({ x: '1e3', mass: '2.5e-1' }), 3);
    expect(r.ok).toBe(true);
    expect(r.body?.x).toBe(1000);
    expect(r.body?.mass).toBeCloseTo(0.25, 12);
  });
});

describe('表单与配置互转', () => {
  it('bodyToDraft 保留显式引力参数与半径', () => {
    const body = {
      x: 1,
      y: 2,
      z: 3,
      vx: 4,
      vy: 5,
      vz: 6,
      mass: 7,
      grav: 8,
      radius: 9,
      id: 10,
    };
    const back = validateBodyDraft(bodyToDraft(body), 3);
    expect(back.ok).toBe(true);
    expect(back.body).toEqual(body);
  });

  it('nextId 生成不冲突的下一个 id', () => {
    expect(nextId([])).toBe(0);
    expect(nextId([{ x: 0, y: 0, vx: 0, vy: 0, mass: 1, id: 3 }])).toBe(4);
    expect(
      nextId([
        { x: 0, y: 0, vx: 0, vy: 0, mass: 1, id: 2 },
        { x: 0, y: 0, vx: 0, vy: 0, mass: 1, id: 9 },
      ]),
    ).toBe(10);
  });
});
