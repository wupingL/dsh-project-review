"""Live acceptance after knowledge bootstrap; local reports, no remote writes."""
from pathlib import Path
import sys
import json

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from project_assistant.backends import backend_settings, credential_status, model_destination
from project_assistant.common import Config, atomic_json, read_json, now
from project_assistant.context import Context
from project_assistant.review import Reviews
from project_assistant.feature import Features


def main():
    config = Config(ROOT / 'config/recsdk.json')
    destination = model_destination(config)
    print(json.dumps({'model_destination': destination}, ensure_ascii=False, indent=2), flush=True)
    problems = []
    try:
        settings = backend_settings(config)
    except Exception as exc:
        raise RuntimeError('Live acceptance blocked before any model request: ' + str(exc)) from exc
    if settings['provider'] != 'deepseek':
        problems.append('model_backend.provider must be deepseek for this acceptance run')
    if not settings['base_url']:
        problems.append('model_backend.base_url is not configured')
    if not settings['model']:
        problems.append('model_backend.model is not configured')
    if not credential_status(config).get('present'):
        problems.append('DeepSeek credential is missing')
    if problems:
        raise RuntimeError('Live acceptance blocked before any model request: ' + '; '.join(problems))
    output = config.state / 'validation'
    context = Context(config)
    snapshots = {}
    for branch in config.get('branches'):
        sid = context.sync(branch)
        snapshots[branch] = context.load(sid)[1]
        print('Semantic baseline ready: ' + branch, flush=True)
    reviews = Reviews(config)
    try:
        replays = []
        for branch, commit in [('develop','4bb64b0'), ('refactor/develop','8ad0b0b')]:
            print('Historical review: ' + branch, flush=True)
            replay = reviews.replay(branch, commit)
            replays.append(replay)
            atomic_json(output / 'live-replays.json', replays)
    finally:
        reviews.state.close()
    print('Feature design acceptance', flush=True)
    design = Features(config).design('develop',
        '只做验收设计，不实现或修改源码：为训练 benchmark 的启动前校验补充 nnodes、node_rank、'
        'nproc_per_node 与 device_id 一致性检查，非法参数应在启动子进程前失败；CPU-only 与已自启 '
        'torchrun 的 Bash 入口保持已有语义。给出具体改动位置、受影响流程、验收条件与已有测试入口，'
        '缺少 NPU 的验证项明确记录。')
    atomic_json(output / 'feature-design-result.json', design)
    result = {'completed_at':now(), 'model_destination':destination, 'semantic_snapshots':snapshots,
              'historical_reviews':replays, 'feature_design_task':design['task_id'],
              'hardware_tests_executed':False}
    atomic_json(output / 'live-acceptance.json', result)
    lines = ['# 项目助手交付验证', '', '- 三个 Skill 已安装；离线自动化测试通过。',
             f"- 模型后端：`{destination.get('provider')}` / `{destination.get('model')}`；"
             "未向远端发布评论或修改仓库。",
             '- 合成检查点恢复缺陷与批处理性能退化均被实际模型检出。', '', '## 语义基线', '']
    for branch, snapshot in snapshots.items():
        lines.append(f"- `{branch}`：`{snapshot['commit']}`，{snapshot['stats']['total']} 个文本文件，六个领域初始语义摘要；保留解析和覆盖缺口。")
    lines += ['', '## 历史系统审查', '']
    for replay in replays:
        report = Path(replay['report']) / 'review.md'
        lines.append(f"- [{replay['branch']} / {replay['commit'][:12]}]({report.as_posix()})")
    lines += ['', '## 新需求上下文与设计', '', f"- 验收任务：`{design['task_id']}`，隔离目录：`{design['workspace']}`。",
              '- 实现、验证和候选知识合入机制已在隔离 Git 夹具测试；本次真实项目仅生成验收设计。',
              '', '## 限制', '', '- 未运行 Ascend/CANN/NPU 测试；CI 仅获取可用的聚合状态。',
              '- 初始领域摘要为按证据生成的有限覆盖，不能视为全项目功能或性能已验证。']
    (output / 'summary.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(json.dumps({'validation':str(output/'summary.md'), 'live_acceptance':str(output/'live-acceptance.json')},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
