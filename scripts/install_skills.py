"""Install thin skill entrypoints without copying the shared knowledge engine."""
import json
import os
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')) / 'skills'
names = ['project-context-sync', 'project-pr-review', 'project-feature-delivery']
for name in names:
    target = destination / name
    if target.exists():
        settings = target / 'installation.json'
        if not settings.exists() or json.loads(settings.read_text())['project_root'] != str(root):
            raise SystemExit(f'Refusing to overwrite existing skill: {target}')
for name in names:
    target = destination / name
    shutil.copytree(root / 'skills' / name, target, dirs_exist_ok=True)
    scripts = target / 'scripts'
    scripts.mkdir(exist_ok=True)
    shutil.copy2(root / 'scripts' / 'skill_runner.ps1', scripts / 'run.ps1')
    (target / 'installation.json').write_text(json.dumps({'project_root': str(root)}, ensure_ascii=False), encoding='utf-8')
    print(f'Installed {name}: {target}')
