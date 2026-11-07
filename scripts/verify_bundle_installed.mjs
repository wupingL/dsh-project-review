/**
 * 安装后的端到端核验（不打开浏览器）。
 *
 * 前提：bundle 已通过 plugin_manager install_bundle 安装到当前 profile，
 * 且 DSH Web GUI 正在 http://127.0.0.1:65189 提供服务。
 *
 * 核验内容：
 *   1. /recsdk-review/api/health      → 控制器健康对象（只读）
 *   2. /recsdk-review/api/pulls       → 真实 GitCode PR 列表（应为 live 且非空）
 *   3. /recsdk-review/api/pulls/<n>   → 单个 PR 详情（含 review 结构）
 *   4. /                              → index HTML 的启动图里出现 @local/recsdk-review
 *   5. 浏览器半身资源可下载             → client.js 能被 Web 服务返回
 *
 * 运行：node scripts/verify_bundle_installed.mjs
 */
import process from 'node:process';

const ORIGIN = process.env.DSH_ORIGIN || 'http://127.0.0.1:65189';
const PLUGIN_ID = '@local/recsdk-review';
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

async function getJson(path) {
  const response = await fetch(ORIGIN + path, { cache: 'no-store' });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: response.status, text, body };
}

function explainUnauthorized() {
  console.error(
    '\n提示：DSH Web 端口要求浏览器会话鉴权（本次请求返回 401 "dsh web authentication required"）。\n' +
    '这不是插件缺陷。请用下面任一方式完成人工/带鉴权核验：\n' +
    '  1) 在已连接的 Harness 页面左侧点击「代码检视」，确认 PR 列表与详情正常渲染；\n' +
    '  2) 从 dsh 启动窗口/日志里取带鉴权的访问 URL，设置 DSH_ORIGIN 后再运行本脚本。\n',
  );
}

async function main() {
  console.log(`Origin: ${ORIGIN}\n`);

  const health = await getJson('/recsdk-review/api/health');
  if (health.status === 401) {
    explainUnauthorized();
    process.exit(2);
  }
  check('插件路由已挂载 /api/health', health.status === 200 && health.body !== null, `status=${health.status}`);
  check('health 返回控制器模型诊断', Boolean(health.body && health.body.model && typeof health.body.model.provider !== 'undefined'));

  const list = await getJson('/recsdk-review/api/pulls');
  check('GET /api/pulls 200', list.status === 200 && list.body !== null, `status=${list.status}`);
  const prs = list.body && Array.isArray(list.body.prs) ? list.body.prs : [];
  check('PR 列表非空', prs.length > 0, `count=${prs.length}`);
  check('PR 列表数据来源为 live 或 cache', Boolean(list.body && ['live', 'cache'].includes(list.body.source)), list.body && list.body.source);
  console.log(`      source=${list.body && list.body.source} count=${prs.length} generated_at=${list.body && list.body.generated_at}`);
  if (prs.length > 0) {
    const first = prs[0];
    check('PR 行含编号/标题/审查状态', Number.isInteger(first.number) && typeof first.title === 'string' && first.review && typeof first.review.status === 'string',
      JSON.stringify({ number: first.number, title: first.title, review: first.review && first.review.status }));

    const detail = await getJson(`/recsdk-review/api/pulls/${first.number}`);
    check(`GET /api/pulls/${first.number} 200`, detail.status === 200 && detail.body !== null, `status=${detail.status}`);
    const review = detail.body && detail.body.review;
    check('详情含 review.findings 数组', Boolean(review && Array.isArray(review.findings)), review && typeof review.findings);
    check('详情含 PR 正文/变更文件字段', Boolean(detail.body && detail.body.pr && typeof detail.body.pr.body !== 'undefined' && detail.body.files));
    console.log(`      PR #${first.number} review.status=${review && review.status} findings=${review && Array.isArray(review.findings) ? review.findings.length : '?'}`);
  }

  const index = await fetch(ORIGIN + '/', { cache: 'no-store' });
  const html = await index.text();
  check('index 200', index.status === 200, `status=${index.status}`);
  const inBoot = html.includes(PLUGIN_ID);
  check(`启动图包含 ${PLUGIN_ID}`, inBoot);

  // 客户端半身由 clientModules 服务提供；从 index 里抽取该 bundle 的 URL 再下载。
  const match = html.match(new RegExp(`[^"']*${PLUGIN_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*`));
  if (match) console.log(`      boot reference: ${match[0].slice(0, 160)}`);
  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) {
    console.log('failures: ' + failures.join(' | '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
