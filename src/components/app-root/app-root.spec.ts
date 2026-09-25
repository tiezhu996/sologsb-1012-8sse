import { newSpecPage } from '@stencil/core/testing';
import { AppRoot } from './app-root';
import { cloneProject, createDemoProject, type FrozenVersion } from '../../models';

function freezeCurrent(project: ReturnType<typeof createDemoProject>): FrozenVersion {
  const { frozenVersions, ...snapshot } = cloneProject(project);
  return { id: 'frozen-test', label: '冻结版本 v1', createdAt: new Date().toISOString(), snapshot };
}

async function setup() {
  const page = await newSpecPage({ components: [AppRoot], html: '<app-root></app-root>' });
  const root = page.rootInstance as AppRoot;
  const project = createDemoProject();
  // 冻结前把 step-1-2 改成旧内容，制造与当前步骤的差异
  const frozen = freezeCurrent(project);
  project.frozenVersions = [frozen];
  project.status = 'draft';
  root.project = project;
  return { page, root, project, frozen };
}

describe('版本记录与历史步骤套用', () => {
  it('展开冻结版本后列出当时的步骤', async () => {
    const { page, root } = await setup();
    (root as any).toggleVersion('frozen-test');
    await page.waitForChanges();
    const steps = page.root!.querySelectorAll('.version-step');
    expect(steps.length).toBe(5);
    expect(page.root!.querySelector('.version-card')?.classList.contains('expanded')).toBe(true);
  });

  it('套用旧字段时沿用当前步骤编号且可撤销', async () => {
    const { page, root, project } = await setup();
    // 当前步骤 step-1-2 改标题，与冻结版本形成差异
    (root as any).updateStep({ title: '改写后的标题' });
    (root as any).selectHistoryStep('frozen-test', 'step-1-2');
    await page.waitForChanges();
    expect(page.root!.querySelectorAll('.diff-row.changed').length).toBeGreaterThan(0);

    (root as any).applyHistoryStep();
    const applied = root.project.modules[0].steps[1];
    expect(applied.id).toBe('step-1-2');
    expect(applied.title).toBe('拆解“你好”的手形');
    // 后续依赖不被打断：step-1-3 仍指向 step-1-2
    expect(root.project.modules[0].steps[2].prerequisiteId).toBe('step-1-2');
    // 冻结记录保留
    expect(root.project.frozenVersions.length).toBe(1);
    // 可撤销
    (root as any).undo();
    expect(root.project.modules[0].steps[1].title).toBe('改写后的标题');
    expect(project.status).toBe('draft');
  });

  it('旧前置条件在当前模块缺失或排在本步之后时保留原内容', async () => {
    const { root } = await setup();
    // 当前选中 step-1-2；旧步骤 step-1-3 的前置是 step-1-2（与当前步骤同位，顺序不成立）
    (root as any).selectHistoryStep('frozen-test', 'step-1-3');
    (root as any).applyHistoryStep();
    const step = root.project.modules[0].steps[1];
    expect(step.title).toBe('拆解“你好”的手形');
    expect(step.prerequisiteId).toBe('step-1-1');

    // 前置条件不存在于当前模块
    (root as any).selectHistoryStep('frozen-test', 'step-2-2');
    (root as any).applyHistoryStep();
    expect(root.project.modules[0].steps[1].title).toBe('拆解“你好”的手形');
  });

  it('旧前置条件合法时可以套用', async () => {
    const { root } = await setup();
    (root as any).selectStep('step-1-3');
    (root as any).selectHistoryStep('frozen-test', 'step-1-2');
    (root as any).applyHistoryStep();
    const step = root.project.modules[0].steps[2];
    expect(step.id).toBe('step-1-3');
    expect(step.title).toBe('拆解“你好”的手形');
    expect(step.prerequisiteId).toBe('step-1-1');
  });
});
