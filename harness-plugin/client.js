window.__ModuleLoader__.load({
  id: '@local/recsdk-review',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'recsdk-review';
    const PANEL_ID = 'recsdk-review';
    const API_BASE = '/recsdk-review/api';
    const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'other'];
    const FILTERS = [
      { id: 'all', label: 'filter.all' },
      { id: 'pending', label: 'filter.pending' },
      { id: 'reviewed', label: 'filter.reviewed' },
      { id: 'issues', label: 'filter.issues' },
    ];

    const ZH = {
      nav: '代码检视',
      title: '代码检视',
      'header.generatedAt': '生成时间',
      'action.refresh': '刷新',
      'action.retry': '重试',
      'action.clearFilters': '清除筛选',
      'source.live': '在线',
      'source.cache': '缓存',
      'source.label': '数据源',
      'filter.searchPlaceholder': '搜索编号、标题或作者',
      'filter.searchAria': '搜索 Pull Request',
      'filter.label': '筛选 Pull Request',
      'filter.all': '全部',
      'filter.pending': '待审查',
      'filter.reviewed': '已审查',
      'filter.issues': '有缺陷',
      'list.counts': '共 {total} 个 / 已审查 {reviewed} / 过期 {stale}',
      'list.empty': '暂无 Pull Request',
      'list.emptyHint': '当前没有可展示的 PR，稍后刷新再看。',
      'list.noMatch': '没有符合筛选条件的 PR',
      'list.noMatchHint': '换个关键词，或调整筛选条件。',
      'list.cacheWarning': '数据源降级：',
      'list.errorTitle': '列表加载失败',
      'list.errorHint': '无法获取 PR 列表，请稍后重试。',
      'detail.back': '返回列表',
      'detail.emptyTitle': '选择一个 Pull Request',
      'detail.emptyHint': '从左侧列表选择 PR，查看 AI 审查结论。',
      'detail.errorTitle': '详情加载失败',
      'detail.errorHint': '无法获取该 PR 的详情，请重试。',
      'detail.missing': '未获取到 PR 详情',
      'detail.missingHint': '返回列表重新选择，或稍后重试。',
      'detail.open': '在 GitCode 打开',
      'detail.author': '作者',
      'detail.mergeable': '可合并',
      'detail.noDescription': '该 PR 没有描述。',
      'detail.head': 'Head',
      'detail.base': 'Base',
      'state.open': '打开',
      'state.draft': '草稿',
      'state.merged': '已合并',
      'state.closed': '已关闭',
      'mergeable.yes': '是',
      'mergeable.no': '否',
      'common.unknown': '未知',
      'common.none': '—',
      'common.loading': '载入中',
      'relative.justNow': '刚刚',
      'relative.minutes': '{n} 分钟前',
      'relative.hours': '{n} 小时前',
      'relative.days': '{n} 天前',
      'relative.unknown': '时间未知',
      'review.none': '未审查',
      'review.running': '审查中',
      'review.done': '已完成',
      'review.stale': '已过期',
      'review.failed': '失败',
      'review.sectionTitle': 'AI 审查',
      'review.emptyTitle': '该 PR 还没有审查结果',
      'review.emptyHint': '可稍后启动审查；结果生成后会显示在这里。',
      'review.queued': '审查排队中',
      'review.queuedHint': '已加入审查队列，完成后会自动出现结果。',
      'review.inProgress': '审查进行中',
      'review.inProgressHint': '正在分析变更，完成后会自动出现结果。',
      'review.failedTitle': '审查失败',
      'review.failedHint': '审查未能完成，可稍后重试。',
      'review.attempts': '尝试次数：{n}',
      'review.intent': '变更意图',
      'review.summary': '审查摘要',
      'review.findingsHeading': '审查发现',
      'review.findingsCount': '{n} 项',
      'review.noFindings': '本次已覆盖的证据中未发现缺陷；这不代表系统功能或性能已通过验证。',
      'finding.untitled': '未命名问题',
      'finding.trigger': '触发条件',
      'finding.systemFunction': '系统功能',
      'finding.consequence': '后果',
      'finding.verification': '验证方法',
      'finding.evidence': '证据',
      'finding.confidence': '置信度',
      'confidence.high': '高',
      'confidence.medium': '中',
      'confidence.low': '低',
      'severity.critical': '致命',
      'severity.high': '高',
      'severity.medium': '中',
      'severity.low': '低',
      'severity.other': '其他',
      'meta.target': '目标分支',
      'meta.reviewedAt': '审查时间',
      'meta.commit': '审查提交',
      'meta.status': '状态',
      'meta.coverageGaps': '覆盖缺口数',
      'meta.ci': 'CI 状态',
      'stale.title': '审查结果可能已过期',
      'stale.message': '该审查基于旧提交（{reviewed}），当前 head 为 {head}，结论可能已过期',
      'files.title': '变更文件',
      'files.none': '未获取到变更文件。',
      'files.expand': '展开全部 {n} 个文件',
      'files.collapse': '收起文件列表',
      'desc.title': 'PR 描述',
      'desc.expand': '展开描述',
      'desc.collapse': '收起描述',
      'lists.affectedFlows': '受影响流程',
      'lists.risksToVerify': '待验证风险',
      'lists.coverageGaps': '覆盖缺口',
      'lists.verificationPlan': '验证计划',
      'health.notReady': '审查执行未就绪：{message}',
      'health.unknown': '未返回具体原因',
      'aria.prList': 'Pull Request 列表',
      'aria.refresh': '刷新 Pull Request 列表',
      'aria.filters': '按审查状态筛选',
      'aria.severityCounts': '缺陷分布：{summary}',
      'aria.openPr': '在 GitCode 打开 PR #{number}',
      'aria.loadingDetail': '正在加载 PR 详情',
      'aria.prRow': '#{number} {title}，{state}，{review}',
      'aria.filesToggle': '切换变更文件列表',
      'aria.descriptionToggle': '切换 PR 描述展开状态',
    };

    const EN = {
      nav: 'Code review',
      title: 'Code review',
      'header.generatedAt': 'Generated',
      'action.refresh': 'Refresh',
      'action.retry': 'Retry',
      'action.clearFilters': 'Clear filters',
      'source.live': 'Live',
      'source.cache': 'Cache',
      'source.label': 'Data source',
      'filter.searchPlaceholder': 'Search number, title, or author',
      'filter.searchAria': 'Search pull requests',
      'filter.label': 'Filter pull requests',
      'filter.all': 'All',
      'filter.pending': 'Pending',
      'filter.reviewed': 'Reviewed',
      'filter.issues': 'With findings',
      'list.counts': '{total} total / {reviewed} reviewed / {stale} stale',
      'list.empty': 'No pull requests',
      'list.emptyHint': 'There are no pull requests to show. Refresh again later.',
      'list.noMatch': 'No pull requests match the filters',
      'list.noMatchHint': 'Try another keyword or adjust the filters.',
      'list.cacheWarning': 'Data source degraded: ',
      'list.errorTitle': 'Could not load the list',
      'list.errorHint': 'The pull request list could not be loaded. Please retry.',
      'detail.back': 'Back to list',
      'detail.emptyTitle': 'Select a pull request',
      'detail.emptyHint': 'Choose a PR from the list to see its AI review.',
      'detail.errorTitle': 'Could not load details',
      'detail.errorHint': 'The pull request details could not be loaded. Please retry.',
      'detail.missing': 'No pull request details',
      'detail.missingHint': 'Go back to the list and select it again, or retry later.',
      'detail.open': 'Open on GitCode',
      'detail.author': 'Author',
      'detail.mergeable': 'Mergeable',
      'detail.noDescription': 'This PR has no description.',
      'detail.head': 'Head',
      'detail.base': 'Base',
      'state.open': 'Open',
      'state.draft': 'Draft',
      'state.merged': 'Merged',
      'state.closed': 'Closed',
      'mergeable.yes': 'Yes',
      'mergeable.no': 'No',
      'common.unknown': 'Unknown',
      'common.none': '—',
      'common.loading': 'Loading',
      'relative.justNow': 'just now',
      'relative.minutes': '{n} min ago',
      'relative.hours': '{n} h ago',
      'relative.days': '{n} d ago',
      'relative.unknown': 'Unknown time',
      'review.none': 'Not reviewed',
      'review.running': 'Reviewing',
      'review.done': 'Reviewed',
      'review.stale': 'Stale',
      'review.failed': 'Failed',
      'review.sectionTitle': 'AI review',
      'review.emptyTitle': 'No review yet',
      'review.emptyHint': 'A review can be started later; results will appear here.',
      'review.queued': 'Review queued',
      'review.queuedHint': 'The review is queued and will appear here when it finishes.',
      'review.inProgress': 'Review in progress',
      'review.inProgressHint': 'The changes are being analyzed; results will appear here when ready.',
      'review.failedTitle': 'Review failed',
      'review.failedHint': 'The review did not finish. Please retry later.',
      'review.attempts': 'Attempts: {n}',
      'review.intent': 'Intent',
      'review.summary': 'Summary',
      'review.findingsHeading': 'Findings',
      'review.findingsCount': '{n} found',
      'review.noFindings': 'No defects were confirmed in the evidence covered by this review; this does not mean the system behavior or performance has passed verification.',
      'finding.untitled': 'Untitled finding',
      'finding.trigger': 'Trigger',
      'finding.systemFunction': 'System function',
      'finding.consequence': 'Consequence',
      'finding.verification': 'Verification',
      'finding.evidence': 'Evidence',
      'finding.confidence': 'Confidence',
      'confidence.high': 'High',
      'confidence.medium': 'Medium',
      'confidence.low': 'Low',
      'severity.critical': 'Critical',
      'severity.high': 'High',
      'severity.medium': 'Medium',
      'severity.low': 'Low',
      'severity.other': 'Other',
      'meta.target': 'Target branch',
      'meta.reviewedAt': 'Reviewed at',
      'meta.commit': 'Reviewed commit',
      'meta.status': 'Status',
      'meta.coverageGaps': 'Coverage gaps',
      'meta.ci': 'CI status',
      'stale.title': 'This review may be out of date',
      'stale.message': 'This review is based on an older commit ({reviewed}); the current head is {head}, so the conclusions may be stale.',
      'files.title': 'Changed files',
      'files.none': 'No changed files were returned.',
      'files.expand': 'Show all {n} files',
      'files.collapse': 'Collapse file list',
      'desc.title': 'PR description',
      'desc.expand': 'Expand description',
      'desc.collapse': 'Collapse description',
      'lists.affectedFlows': 'Affected flows',
      'lists.risksToVerify': 'Risks to verify',
      'lists.coverageGaps': 'Coverage gaps',
      'lists.verificationPlan': 'Verification plan',
      'health.notReady': 'Review execution is not ready: {message}',
      'health.unknown': 'No reason was returned',
      'aria.prList': 'Pull request list',
      'aria.refresh': 'Refresh the pull request list',
      'aria.filters': 'Filter by review state',
      'aria.severityCounts': 'Finding distribution: {summary}',
      'aria.openPr': 'Open PR #{number} on GitCode',
      'aria.loadingDetail': 'Loading pull request details',
      'aria.prRow': '#{number} {title}, {state}, {review}',
      'aria.filesToggle': 'Toggle the changed files list',
      'aria.descriptionToggle': 'Toggle the PR description',
    };

    const CSS = `
.rr-page {
  --rr-critical: #e5484d;
  --rr-critical-bg: rgba(229, 72, 77, .12);
  --rr-high: #f76b15;
  --rr-high-bg: rgba(247, 107, 21, .12);
  --rr-medium: #f5a524;
  --rr-medium-bg: rgba(245, 165, 36, .14);
  --rr-low: #8b8b8b;
  --rr-low-bg: rgba(139, 139, 139, .14);
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}
.rr-page, .rr-page * { box-sizing: border-box; }
.rr-page .rr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 12px 16px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-head-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rr-page .rr-head-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.rr-page .rr-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-brand-primary);
}
.rr-page .rr-title { margin: 0; font-size: 15px; line-height: 1.35; font-weight: 600; color: var(--dsw-alias-label-primary); }
.rr-page .rr-repo {
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
}
.rr-page .rr-head-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  min-width: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-tertiary);
}
.rr-page .rr-source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  white-space: nowrap;
}
.rr-page .rr-source.is-live { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-source-dot { width: 5px; height: 5px; flex: none; border-radius: 999px; background: var(--dsw-alias-label-tertiary); }
.rr-page .rr-source.is-live .rr-source-dot { background: var(--dsw-alias-brand-primary); }
.rr-page .rr-generated { white-space: nowrap; }
.rr-page .rr-head-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.rr-page .rr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.rr-page .rr-btn:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-btn:active { background: var(--dsw-alias-interactive-bg-active); }
.rr-page .rr-btn:disabled { opacity: .5; cursor: not-allowed; }
.rr-page .rr-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.rr-page .rr-btn-link { color: var(--dsw-alias-link); text-decoration: none; }
.rr-page .rr-btn-sm { min-height: 24px; padding: 0 8px; font-size: 11px; }
.rr-page .rr-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.rr-page .rr-spin { animation: rr-spin .9s linear infinite; }
.rr-page .rr-body {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.rr-page .rr-listpane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1);
  border-right: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-controls {
  display: flex;
  flex-direction: column;
  flex: none;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-search-wrap { position: relative; }
.rr-page .rr-search-icon {
  position: absolute;
  top: 50%;
  left: 9px;
  transform: translateY(-50%);
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}
.rr-page .rr-search {
  width: 100%;
  min-height: 30px;
  padding: 5px 9px 5px 28px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.rr-page .rr-search:hover { border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-search:focus { border-color: var(--dsw-alias-brand-primary); }
.rr-page .rr-search::placeholder { color: var(--dsw-alias-label-caption); }
.rr-page .rr-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.rr-page .rr-chip {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 1.35;
  cursor: pointer;
}
.rr-page .rr-chip:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.rr-page .rr-chip[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.rr-page .rr-counts { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.rr-page .rr-cache-warn {
  padding-left: 6px;
  border-left: 2px solid var(--rr-high);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.rr-page .rr-list-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  overscroll-behavior: contain;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) var(--dsw-alias-scrollbar-bg-l1);
  scrollbar-width: thin;
}
.rr-page .rr-detailpane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
  overscroll-behavior: contain;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) var(--dsw-alias-scrollbar-bg-l1);
  scrollbar-width: thin;
}
.rr-page .rr-list-scroll::-webkit-scrollbar,
.rr-page .rr-detailpane::-webkit-scrollbar,
.rr-page .rr-prbody::-webkit-scrollbar { width: 10px; height: 10px; }
.rr-page .rr-list-scroll::-webkit-scrollbar-track,
.rr-page .rr-detailpane::-webkit-scrollbar-track,
.rr-page .rr-prbody::-webkit-scrollbar-track { background: var(--dsw-alias-scrollbar-bg-l1); }
.rr-page .rr-list-scroll::-webkit-scrollbar-thumb,
.rr-page .rr-detailpane::-webkit-scrollbar-thumb,
.rr-page .rr-prbody::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l2); border-radius: 999px; }
.rr-page .rr-row {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  outline: none;
  transition: background-color .12s ease, border-color .12s ease;
}
.rr-page .rr-row + .rr-row { margin-top: 6px; }
.rr-page .rr-row:hover { background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-row:active { background: var(--dsw-alias-interactive-bg-active); }
.rr-page .rr-row.is-selected {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary);
}
.rr-page .rr-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.rr-page .rr-row-head { display: flex; align-items: center; gap: 6px; min-width: 0; margin-bottom: 4px; }
.rr-page .rr-num { flex: none; color: var(--dsw-alias-link); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12px; font-weight: 600; }
.rr-page .rr-spacer { flex: 1 1 auto; }
.rr-page .rr-state {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
}
.rr-page .rr-state-open { color: var(--dsw-alias-link); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-state-draft { color: var(--dsw-alias-label-tertiary); }
.rr-page .rr-row-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 5px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.rr-page .rr-row-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.rr-page .rr-row-author { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rr-page .rr-row-branches { display: flex; align-items: center; flex: 1 1 120px; gap: 4px; min-width: 0; overflow: hidden; }
.rr-page .rr-branch {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
}
.rr-page .rr-arrow { flex: none; color: var(--dsw-alias-label-caption); }
.rr-page .rr-row-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 18px; margin-top: 5px; }
.rr-page .rr-updated { color: var(--dsw-alias-label-caption); font-size: 10.5px; white-space: nowrap; }
.rr-page .rr-review-cluster { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.rr-page .rr-review-badge {
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
}
.rr-page .rr-review-badge.is-running { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-review-badge.is-current { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-3); }
.rr-page .rr-review-badge.is-stale { color: var(--rr-high); background: var(--rr-high-bg); border-color: var(--rr-high-bg); }
.rr-page .rr-review-badge.is-failed { color: var(--rr-critical); background: var(--rr-critical-bg); border-color: var(--rr-critical-bg); }
.rr-page .rr-review-badge.is-none { color: var(--dsw-alias-label-tertiary); }
.rr-page .rr-dots { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.rr-page .rr-dot-item { display: inline-flex; align-items: center; gap: 2px; }
.rr-page .rr-dot { display: inline-block; width: 6px; height: 6px; border-radius: 999px; flex: none; background: var(--dsw-alias-label-tertiary); }
.rr-page .rr-dot-critical { background: var(--rr-critical); }
.rr-page .rr-dot-high { background: var(--rr-high); }
.rr-page .rr-dot-medium { background: var(--rr-medium); }
.rr-page .rr-dot-low { background: var(--rr-low); }
.rr-page .rr-dot-other { background: var(--dsw-alias-label-tertiary); }
.rr-page .rr-dot-count { color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 1; }
.rr-page .rr-empty {
  margin: 8px 0;
  padding: 22px 16px;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}
.rr-page .rr-empty-icon { display: flex; justify-content: center; margin-bottom: 6px; color: var(--dsw-alias-label-tertiary); }
.rr-page .rr-empty-title { margin-bottom: 2px; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.rr-page .rr-empty-hint { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.6; }
.rr-page .rr-empty-action { margin-top: 10px; display: flex; justify-content: center; }
.rr-page .rr-empty-soft { margin: 0; padding: 12px 14px; text-align: left; border-style: dashed; background: var(--dsw-alias-bg-layer-1); }
.rr-page .rr-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 8px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 3px solid var(--rr-critical);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
}
.rr-page .rr-banner-main { min-width: 0; }
.rr-page .rr-banner-title { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.rr-page .rr-banner-text { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word; }
.rr-page .rr-skeleton-list { display: flex; flex-direction: column; gap: 6px; }
.rr-page .rr-skeleton-row {
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
}
.rr-page .rr-sk-line {
  height: 9px;
  margin: 7px 0;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3);
  animation: rr-pulse 1.4s ease-in-out infinite;
}
.rr-page .rr-sk-line:first-child { margin-top: 0; }
.rr-page .rr-sk-line:last-child { margin-bottom: 0; }
.rr-page .rr-detail-inner { width: 100%; max-width: 1000px; min-width: 0; margin: 0 auto; padding: 16px 20px 28px; }
.rr-page .rr-back { display: none; margin: 0 0 10px; }
.rr-page .rr-detail-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-width: 0; }
.rr-page .rr-detail-main { flex: 1 1 auto; min-width: 0; }
.rr-page .rr-detail-actions { flex: none; padding-top: 2px; }
.rr-page .rr-detail-kicker { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.rr-page .rr-num-lg {
  color: var(--dsw-alias-link);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  font-weight: 600;
}
.rr-page .rr-detail-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 18px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.rr-page .rr-detail-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; margin-top: 8px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.rr-page .rr-meta-key { color: var(--dsw-alias-label-caption); }
.rr-page .rr-mono {
  padding: 1px 4px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
  overflow-wrap: anywhere;
}
.rr-page .rr-inline-link { color: var(--dsw-alias-link); text-decoration: none; cursor: pointer; }
.rr-page .rr-inline-link:hover { text-decoration: underline; }
.rr-page .rr-inline-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.rr-page .rr-branches { display: inline-flex; align-items: center; gap: 4px; min-width: 0; flex-wrap: wrap; }
.rr-page .rr-stale {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--rr-high-bg);
  border-radius: 8px;
  background: var(--rr-high-bg);
}
.rr-page .rr-stale-icon { flex: none; display: inline-flex; margin-top: 1px; color: var(--rr-high); }
.rr-page .rr-stale-body { min-width: 0; }
.rr-page .rr-stale-title { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.rr-page .rr-stale-msg { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.rr-page .rr-stale-extra { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.5; overflow-wrap: anywhere; }
.rr-page .rr-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 14px;
  padding: 1px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-border-l1);
}
.rr-page .rr-meta-cell { min-width: 0; padding: 8px 10px; background: var(--dsw-alias-bg-layer-1); }
.rr-page .rr-meta-label { margin-bottom: 1px; color: var(--dsw-alias-label-caption); font-size: 10.5px; }
.rr-page .rr-meta-value { color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.rr-page .rr-section { min-width: 0; margin-top: 20px; }
.rr-page .rr-section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.rr-page .rr-section-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
.rr-page .rr-section-count { color: var(--dsw-alias-label-tertiary); font-size: 11px; font-weight: 400; }
.rr-page .rr-review-lead { margin-bottom: 12px; }
.rr-page .rr-kicker-label { margin-bottom: 2px; color: var(--dsw-alias-label-caption); font-size: 10.5px; }
.rr-page .rr-review-paragraph { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.rr-page .rr-statusbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.rr-page .rr-spinner {
  width: 12px;
  height: 12px;
  flex: none;
  margin-top: 3px;
  border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  border-radius: 999px;
  animation: rr-spin .9s linear infinite;
}
.rr-page .rr-status-title { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
.rr-page .rr-status-hint { margin-top: 1px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.55; }
.rr-page .rr-attempts { margin-top: 4px; color: var(--dsw-alias-label-caption); font-size: 10.5px; }
.rr-page .rr-errorbox {
  padding: 12px 14px;
  border: 1px solid var(--rr-critical-bg);
  border-left: 3px solid var(--rr-critical);
  border-radius: 8px;
  background: var(--rr-critical-bg);
}
.rr-page .rr-errorbox-title { color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; }
.rr-page .rr-errorbox-text { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.rr-page .rr-no-findings {
  padding: 10px 12px;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.rr-page .rr-findings { margin-top: 14px; }
.rr-page .rr-findings-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.rr-page .rr-findings-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.rr-page .rr-muted { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.rr-page .rr-finding-group { margin-top: 10px; }
.rr-page .rr-finding-group-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.rr-page .rr-finding-group-label { color: var(--rr-sev-color, var(--dsw-alias-label-secondary)); font-size: 11.5px; font-weight: 600; }
.rr-page .rr-finding-group-count { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
.rr-page .rr-finding {
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 3px solid var(--rr-sev-color, var(--dsw-alias-border-l2));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.rr-page .rr-sev-critical { --rr-sev-color: var(--rr-critical); --rr-sev-bg: var(--rr-critical-bg); }
.rr-page .rr-sev-high { --rr-sev-color: var(--rr-high); --rr-sev-bg: var(--rr-high-bg); }
.rr-page .rr-sev-medium { --rr-sev-color: var(--rr-medium); --rr-sev-bg: var(--rr-medium-bg); }
.rr-page .rr-sev-low { --rr-sev-color: var(--rr-low); --rr-sev-bg: var(--rr-low-bg); }
.rr-page .rr-sev-other { --rr-sev-color: var(--dsw-alias-label-tertiary); --rr-sev-bg: var(--dsw-alias-bg-layer-2); }
.rr-page .rr-sev-badge {
  color: var(--rr-sev-color, var(--dsw-alias-label-secondary));
  background: var(--rr-sev-bg, var(--dsw-alias-bg-layer-2));
  border-color: var(--rr-sev-bg, var(--dsw-alias-border-l1));
}
.rr-page .rr-finding-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.rr-page .rr-finding-title { min-width: 0; color: var(--dsw-alias-label-primary); font-size: 12.5px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.rr-page .rr-finding-tags { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; flex: none; gap: 4px; }
.rr-page .rr-badge {
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 1.6;
  white-space: nowrap;
}
.rr-page .rr-finding-fields { display: grid; gap: 4px; margin-top: 8px; }
.rr-page .rr-finding-row { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 8px; font-size: 12px; line-height: 1.55; }
.rr-page .rr-finding-key { color: var(--dsw-alias-label-caption); font-size: 11px; }
.rr-page .rr-finding-val { color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.rr-page .rr-evidence {
  margin-top: 8px;
  padding: 7px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-markdown-code-block);
}
.rr-page .rr-evidence-label { margin-bottom: 3px; color: var(--dsw-alias-label-caption); font-size: 10.5px; }
.rr-page .rr-evidence-item { display: flex; flex-wrap: wrap; gap: 2px 8px; font-size: 11.5px; line-height: 1.55; }
.rr-page .rr-evidence-item + .rr-evidence-item { margin-top: 3px; }
.rr-page .rr-evidence-path {
  color: var(--dsw-alias-link);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.rr-page .rr-evidence-reason { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.rr-page .rr-list-block { margin-top: 12px; }
.rr-page .rr-list-label { margin-bottom: 3px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; font-weight: 600; }
.rr-page .rr-bullets { margin: 0; padding-left: 18px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.rr-page .rr-bullets li { margin: 2px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.rr-page .rr-files { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.rr-page .rr-file {
  padding: 6px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.rr-page .rr-file:first-child { border-top: 0; }
.rr-page .rr-toggle { margin-top: 6px; }
.rr-page .rr-pr-desc { min-width: 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.rr-page .rr-prbody {
  max-height: 300px;
  overflow: auto;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: auto;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2) var(--dsw-alias-scrollbar-bg-l1);
  scrollbar-width: thin;
}
.rr-page .rr-prbody.is-collapsed { max-height: 112px; }
.rr-page .rr-prbody:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.rr-page .rr-health {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.5;
}
.rr-page .rr-health-icon { flex: none; display: inline-flex; margin-top: 1px; color: var(--dsw-alias-label-tertiary); }
.rr-page .rr-state-card { max-width: 620px; }
.rr-page .rr-detail-skeleton { max-width: 900px; padding: 2px 0; }
.rr-page .rr-skeleton-heading { height: 22px; width: 55%; margin: 0 0 12px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3); animation: rr-pulse 1.4s ease-in-out infinite; }
.rr-page .rr-skeleton-meta { height: 64px; margin-top: 16px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); animation: rr-pulse 1.4s ease-in-out infinite; }
.rr-page .rr-skeleton-block { height: 120px; margin-top: 16px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); animation: rr-pulse 1.4s ease-in-out infinite; }
@keyframes rr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes rr-pulse { 0%, 100% { opacity: .45; } 50% { opacity: .95; } }
@media (max-width: 900px) {
  .rr-page .rr-body { grid-template-columns: minmax(0, 1fr); }
  .rr-page .rr-listpane { border-right: 0; }
  .rr-page[data-view="list"] .rr-detailpane { display: none; }
  .rr-page[data-view="detail"] .rr-listpane { display: none; }
  .rr-page[data-view="detail"] .rr-back { display: inline-flex; }
  .rr-page .rr-head { padding: 10px 12px; }
  .rr-page .rr-detail-inner { padding: 12px 14px 24px; }
  .rr-page .rr-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rr-page .rr-repo { max-width: 200px; }
}
@media (max-width: 560px) {
  .rr-page .rr-head { align-items: flex-start; flex-wrap: wrap; }
  .rr-page .rr-head-actions { margin-left: auto; }
  .rr-page .rr-head-meta { gap: 4px 8px; }
  .rr-page .rr-repo { max-width: 150px; }
  .rr-page .rr-meta-grid { grid-template-columns: minmax(0, 1fr); }
  .rr-page .rr-finding-head { flex-wrap: wrap; }
  .rr-page .rr-finding-tags { justify-content: flex-start; }
  .rr-page .rr-finding-row { grid-template-columns: minmax(0, 1fr); gap: 1px; }
  .rr-page .rr-detail-actions { padding-top: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .rr-page .rr-spin,
  .rr-page .rr-spinner,
  .rr-page .rr-sk-line,
  .rr-page .rr-skeleton-heading,
  .rr-page .rr-skeleton-meta,
  .rr-page .rr-skeleton-block { animation: none !important; }
}
`;

    function isObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function asText(value, fallback) {
      const empty = fallback === undefined ? '' : fallback;
      if (value === null || value === undefined || value === '') return empty;
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) {
        const parts = value.map(function (item) { return asText(item, ''); }).filter(Boolean);
        return parts.length ? parts.join('\n') : empty;
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch (error) {
        return String(value);
      }
    }

    function asLines(value) {
      if (Array.isArray(value)) {
        return value.map(function (item) { return asText(item, ''); }).filter(function (item) { return item.trim() !== ''; });
      }
      if (typeof value === 'string' && value.trim() !== '') return [value];
      if (isObject(value)) {
        const serialized = asText(value, '');
        return serialized ? [serialized] : [];
      }
      return [];
    }

    function fill(template, values) {
      const source = template === null || template === undefined ? '' : String(template);
      return source.replace(/\{(\w+)\}/g, function (match, key) {
        return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
      });
    }

    function numberOr(value, fallback) {
      const parsed = typeof value === 'number' ? value : parseInt(asText(value, ''), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function nonNegative(value, fallback) {
      const parsed = numberOr(value, fallback);
      return parsed > 0 ? parsed : 0;
    }

    function toDate(value) {
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        const millis = Math.abs(value) < 100000000000 ? value * 1000 : value;
        const date = new Date(millis);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return null;
        if (/^\d{9,14}(\.\d+)?$/.test(raw)) {
          const number = Number(raw);
          const millis = Math.abs(number) < 100000000000 ? number * 1000 : number;
          const date = new Date(millis);
          return Number.isNaN(date.getTime()) ? null : date;
        }
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      return null;
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    function formatDate(value) {
      const date = toDate(value);
      if (!date) return asText(value, '');
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
        + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function relativeTime(value, t) {
      const date = toDate(value);
      if (!date) return t('relative.unknown');
      const diff = Math.max(0, Date.now() - date.getTime());
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return t('relative.justNow');
      if (minutes < 60) return fill(t('relative.minutes'), { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return fill(t('relative.hours'), { n: hours });
      return fill(t('relative.days'), { n: Math.floor(hours / 24) });
    }

    function shortSha(value) {
      const text = asText(value, '').trim();
      return text.length > 7 ? text.slice(0, 7) : text;
    }

    function safeHttpUrl(value) {
      if (typeof value !== 'string') return '';
      const text = value.trim();
      return /^https?:\/\//i.test(text) ? text : '';
    }

    function errorText(error) {
      if (!error) return '';
      if (typeof error === 'string') return error;
      if (error.message) return String(error.message);
      try {
        return String(error);
      } catch (ignored) {
        return '';
      }
    }

    async function fetchJSON(path, signal) {
      let response;
      try {
        response = await fetch(path, { cache: 'no-store', signal: signal });
      } catch (error) {
        if (signal && signal.aborted) throw error;
        throw new Error(errorText(error) || 'Network error');
      }
      let data = null;
      try {
        data = await response.json();
      } catch (ignored) {
        data = null;
      }
      if (!response.ok) {
        let message = '';
        if (isObject(data)) message = asText(data.error || data.message || data.detail, '');
        throw new Error(message || ('HTTP ' + response.status));
      }
      return data;
    }

    function reviewKind(review) {
      if (!isObject(review)) return 'none';
      const status = asText(review.status, '').trim().toLowerCase();
      if (status === 'current') return 'current';
      if (status === 'stale' || status === 'obsolete') return 'stale';
      if (status === 'failed') return 'failed';
      if (status === 'queued' || status === 'running') return 'running';
      return 'none';
    }

    function reviewStatusLabel(kind, t) {
      if (kind === 'running') return t('review.running');
      if (kind === 'current') return t('review.done');
      if (kind === 'stale') return t('review.stale');
      if (kind === 'failed') return t('review.failed');
      return t('review.none');
    }

    function reportExists(review) {
      if (!isObject(review)) return false;
      const status = asText(review.status, '').trim().toLowerCase();
      return !!(review.report_dir || review.reviewed_at || review.checked_at
        || status === 'current' || status === 'stale' || status === 'obsolete');
    }

    function findingsCount(review) {
      if (!isObject(review)) return 0;
      if (Array.isArray(review.findings)) return review.findings.length;
      return nonNegative(review.findings, 0);
    }

    function coverageGapCount(review) {
      if (!isObject(review)) return 0;
      if (Array.isArray(review.coverage_gaps)) return review.coverage_gaps.length;
      return nonNegative(review.coverage_gaps, 0);
    }

    function severityCounts(review) {
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      if (!isObject(review)) return counts;
      if (isObject(review.severity)) {
        counts.critical = nonNegative(review.severity.critical, 0);
        counts.high = nonNegative(review.severity.high, 0);
        counts.medium = nonNegative(review.severity.medium, 0);
        counts.low = nonNegative(review.severity.low, 0);
      }
      const knownTotal = counts.critical + counts.high + counts.medium + counts.low;
      if (knownTotal > 0) return counts;
      if (Array.isArray(review.findings)) {
        review.findings.forEach(function (finding) {
          const severity = normalizeSeverity(isObject(finding) ? finding.severity : '');
          if (Object.prototype.hasOwnProperty.call(counts, severity)) counts[severity] += 1;
        });
      }
      return counts;
    }

    function normalizeSeverity(value) {
      const key = asText(value, '').trim().toLowerCase();
      return SEVERITY_ORDER.indexOf(key) >= 0 ? key : 'other';
    }

    function confidenceLabel(value, t) {
      const key = asText(value, '').trim().toLowerCase();
      if (key === 'high' || key === 'medium' || key === 'low') return t('confidence.' + key);
      return asText(value, '');
    }

    function groupFindings(findings) {
      const groups = { critical: [], high: [], medium: [], low: [], other: [] };
      (Array.isArray(findings) ? findings : []).forEach(function (finding) {
        const safeFinding = isObject(finding) ? finding : {};
        groups[normalizeSeverity(safeFinding.severity)].push(safeFinding);
      });
      return SEVERITY_ORDER.map(function (severity) {
        return { severity: severity, items: groups[severity] };
      }).filter(function (group) { return group.items.length > 0; });
    }

    function stateInfo(pr, t) {
      if (!isObject(pr)) return { key: 'other', label: t('common.unknown') };
      if (pr.draft) return { key: 'draft', label: t('state.draft') };
      const state = asText(pr.state, '').trim().toLowerCase();
      if (state === 'open' || state === 'opened') return { key: 'open', label: t('state.open') };
      if (state === 'merged') return { key: 'merged', label: t('state.merged') };
      if (state === 'closed') return { key: 'closed', label: t('state.closed') };
      return { key: 'other', label: asText(pr.state, t('common.unknown')) };
    }

    function mergeableLabel(value, t) {
      if (value === true || value === 'true' || value === 'yes' || value === 'clean' || value === 'mergeable') return t('mergeable.yes');
      if (value === false || value === 'false' || value === 'no' || value === 'dirty' || value === 'unmergeable' || value === 'conflict') return t('mergeable.no');
      const raw = asText(value, '').trim();
      if (raw && raw.toLowerCase() !== 'unknown') return raw;
      return t('common.unknown');
    }

    function jobActivity(review, job) {
      const reviewStatus = isObject(review) ? asText(review.status, '').trim().toLowerCase() : '';
      if (reviewStatus === 'queued') return 'queued';
      if (reviewStatus === 'running') return 'running';
      const jobStatus = isObject(job) ? asText(job.status, '').trim().toLowerCase() : '';
      if (jobStatus === 'queued' || jobStatus === 'pending') return 'queued';
      if (jobStatus === 'running' || jobStatus === 'processing') return 'running';
      return '';
    }

    function NavIcon(props) {
      const owner = props || {};
      const size = owner.size || 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('rect', { x: 3.5, y: 3.5, width: 17, height: 15, rx: 3 }),
        h('path', { d: 'M7 9h7M7 13h4' }),
        h('path', { d: 'm14.5 13 1.8 1.8 3-3.2' })
      );
    }

    function RefreshIcon(props) {
      const owner = props || {};
      const size = owner.size || 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
        h('path', { d: 'M20 11a8.1 8.1 0 0 0-15.5-3M4 4v4h4' }),
        h('path', { d: 'M4 13a8.1 8.1 0 0 0 15.5 3M20 20v-4h-4' })
      );
    }

    function SearchIcon(props) {
      const owner = props || {};
      const size = owner.size || 13;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
        h('circle', { cx: 11, cy: 11, r: 7 }),
        h('path', { d: 'm20 20-3.5-3.5' })
      );
    }

    function BackIcon(props) {
      const owner = props || {};
      const size = owner.size || 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      }, h('path', { d: 'm15 18-6-6 6-6' }));
    }

    function ExternalIcon(props) {
      const owner = props || {};
      const size = owner.size || 13;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
        h('path', { d: 'M14 4h6v6M20 4l-9 9' }),
        h('path', { d: 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' })
      );
    }

    function AlertIcon(props) {
      const owner = props || {};
      const size = owner.size || 14;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      },
        h('path', { d: 'M12 3 2.8 19a1.2 1.2 0 0 0 1 1.8h16.4a1.2 1.2 0 0 0 1-1.8L12 3Z' }),
        h('path', { d: 'M12 9v4M12 17h.01' })
      );
    }

    function ChevronIcon(props) {
      const owner = props || {};
      const size = owner.size || 12;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
      }, h('path', { d: owner.up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6' }));
    }

    function EmptyState(props) {
      const action = props.action || null;
      return h('div', { className: 'rr-empty' },
        props.icon ? h('div', { className: 'rr-empty-icon' }, props.icon) : null,
        h('div', { className: 'rr-empty-title' }, props.title),
        props.hint ? h('div', { className: 'rr-empty-hint' }, props.hint) : null,
        action ? h('div', { className: 'rr-empty-action' }, action) : null
      );
    }

    function PrRow(props) {
      const pr = isObject(props.pr) ? props.pr : {};
      const t = props.t;
      const review = isObject(pr.review) ? pr.review : null;
      const kind = reviewKind(review);
      const statusLabel = reviewStatusLabel(kind, t);
      const state = stateInfo(pr, t);
      const author = isObject(pr.author) ? (asText(pr.author.name, '') || asText(pr.author.login, '')) : '';
      const source = asText(pr.source_branch, t('common.unknown'));
      const target = asText(pr.target, t('common.unknown'));
      const numberText = pr.number === null || pr.number === undefined ? '—' : String(pr.number);
      const title = asText(pr.title, t('common.unknown'));
      const severity = severityCounts(review);
      const totalFindings = findingsCount(review);
      const severityItems = ['critical', 'high', 'medium', 'low'].filter(function (key) { return severity[key] > 0; });
      const severitySummary = severityItems.map(function (key) {
        return t('severity.' + key) + ' ' + severity[key];
      }).join(' · ');
      const updatedText = relativeTime(pr.updated_at, t);
      const updatedAt = asText(pr.updated_at, '');
      const rowLabel = fill(t('aria.prRow'), {
        number: numberText,
        title: title,
        state: state.label,
        review: statusLabel,
      });
      function select() {
        if (props.onSelect && pr.number !== null && pr.number !== undefined) props.onSelect(pr.number);
      }
      function onKeyDown(event) {
        if (!event) return;
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          select();
        }
      }
      return h('div', {
        className: 'rr-row' + (props.selected ? ' is-selected' : ''),
        role: 'button',
        tabIndex: 0,
        'aria-current': props.selected ? 'true' : undefined,
        'aria-label': rowLabel,
        onClick: select,
        onKeyDown: onKeyDown,
      },
        h('div', { className: 'rr-row-head' },
          h('span', { className: 'rr-num' }, '#' + numberText),
          h('span', { className: 'rr-state rr-state-' + state.key }, state.label),
          h('span', { className: 'rr-spacer' }),
          h('span', { className: 'rr-review-cluster' },
            h('span', { className: 'rr-review-badge is-' + kind }, statusLabel),
            totalFindings > 0 && severityItems.length > 0
              ? h('span', {
                  className: 'rr-dots',
                  role: 'img',
                  title: severitySummary,
                  'aria-label': fill(t('aria.severityCounts'), { summary: severitySummary }),
                }, severityItems.map(function (key) {
                  return h('span', { key: key, className: 'rr-dot-item' },
                    h('span', { className: 'rr-dot rr-dot-' + key }),
                    h('span', { className: 'rr-dot-count' }, String(severity[key]))
                  );
                }))
              : null
          )
        ),
        h('div', { className: 'rr-row-title' }, title),
        h('div', { className: 'rr-row-meta' },
          h('span', { className: 'rr-row-author' }, author || t('common.unknown')),
          h('span', { className: 'rr-row-branches' },
            h('span', { className: 'rr-branch', title: source }, source),
            h('span', { className: 'rr-arrow' }, '→'),
            h('span', { className: 'rr-branch', title: target }, target)
          )
        ),
        h('div', { className: 'rr-row-foot' },
          h('span', { className: 'rr-updated', title: updatedAt }, updatedText),
          totalFindings > 0 ? h('span', { className: 'rr-muted' }, fill(t('review.findingsCount'), { n: totalFindings })) : null
        )
      );
    }

    function ListSkeleton(props) {
      const t = props.t;
      const rows = [];
      for (let index = 0; index < 6; index += 1) {
        rows.push(h('div', { key: index, className: 'rr-skeleton-row', 'aria-hidden': 'true' },
          h('div', { className: 'rr-sk-line', style: { width: '38%' } }),
          h('div', { className: 'rr-sk-line', style: { width: '88%' } }),
          h('div', { className: 'rr-sk-line', style: { width: '62%' } })
        ));
      }
      return h('div', { className: 'rr-skeleton-list', 'aria-busy': 'true', 'aria-label': t('common.loading') }, rows);
    }

    function DetailSkeleton(props) {
      return h('div', { className: 'rr-detail-skeleton', role: 'status', 'aria-label': props.t('aria.loadingDetail') },
        h('div', { className: 'rr-skeleton-heading' }),
        h('div', { className: 'rr-sk-line', style: { width: '35%', height: '11px', animation: 'rr-pulse 1.4s ease-in-out infinite', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '4px' } }),
        h('div', { className: 'rr-skeleton-meta' }),
        h('div', { className: 'rr-skeleton-block' })
      );
    }

    function MetaCell(props) {
      return h('div', { className: 'rr-meta-cell' },
        h('div', { className: 'rr-meta-label' }, props.label),
        h('div', { className: 'rr-meta-value' }, props.children === undefined || props.children === null ? props.fallback : props.children)
      );
    }

    function FindingField(props) {
      return h('div', { className: 'rr-finding-row' },
        h('div', { className: 'rr-finding-key' }, props.label),
        h('div', { className: 'rr-finding-val' }, props.value)
      );
    }

    function BulletBlock(props) {
      if (!Array.isArray(props.items) || props.items.length === 0) return null;
      return h('div', { className: 'rr-list-block' },
        h('div', { className: 'rr-list-label' }, props.title),
        h('ul', { className: 'rr-bullets' }, props.items.map(function (item, index) {
          return h('li', { key: index }, item);
        }))
      );
    }

    function ReviewActivity(props) {
      const queued = props.activity === 'queued';
      return h('div', { className: 'rr-statusbox', role: 'status' },
        h('span', { className: 'rr-spinner', 'aria-hidden': 'true' }),
        h('div', null,
          h('div', { className: 'rr-status-title' }, queued ? props.t('review.queued') : props.t('review.inProgress')),
          h('div', { className: 'rr-status-hint' }, queued ? props.t('review.queuedHint') : props.t('review.inProgressHint')),
          props.attempts > 0 ? h('div', { className: 'rr-attempts' }, fill(props.t('review.attempts'), { n: props.attempts })) : null
        )
      );
    }

    function ReviewBody(props) {
      const t = props.t;
      const review = isObject(props.review) ? props.review : null;
      const job = isObject(props.job) ? props.job : {};
      const kind = reviewKind(review);
      const activity = jobActivity(review, job);
      const attempts = nonNegative(review && review.job_attempts, nonNegative(job.attempts, 0));
      const jobError = asText((review && review.job_error) || job.error, '');

      if (kind === 'none' && activity) {
        return h(ReviewActivity, { t: t, activity: activity, attempts: attempts });
      }
      if (kind === 'running') {
        const activityKind = activity || (asText(review && review.status, '').toLowerCase() === 'queued' ? 'queued' : 'running');
        return h(ReviewActivity, { t: t, activity: activityKind, attempts: attempts });
      }
      if (kind === 'failed') {
        return h('div', { className: 'rr-errorbox', role: 'alert' },
          h('div', { className: 'rr-errorbox-title' }, t('review.failedTitle')),
          h('div', { className: 'rr-errorbox-text' }, jobError || t('review.failedHint')),
          attempts > 0 ? h('div', { className: 'rr-attempts' }, fill(t('review.attempts'), { n: attempts })) : null
        );
      }
      if (kind === 'none') {
        return h(EmptyState, {
          title: t('review.emptyTitle'),
          hint: t('review.emptyHint'),
        });
      }

      const intent = asText(review.intent, '').trim();
      const summary = asText(review.summary, '').trim();
      const findings = Array.isArray(review.findings) ? review.findings : [];
      const groups = groupFindings(findings);

      return h('div', { className: 'rr-review-body' },
        intent ? h('div', { className: 'rr-review-lead' },
          h('div', { className: 'rr-kicker-label' }, t('review.intent')),
          h('p', { className: 'rr-review-paragraph' }, intent)
        ) : null,
        summary ? h('div', { className: 'rr-review-lead' },
          h('div', { className: 'rr-kicker-label' }, t('review.summary')),
          h('p', { className: 'rr-review-paragraph' }, summary)
        ) : null,
        findings.length > 0 ? h('div', { className: 'rr-findings' },
          h('div', { className: 'rr-findings-head' },
            h('h3', { className: 'rr-findings-title' }, t('review.findingsHeading')),
            h('span', { className: 'rr-muted' }, fill(t('review.findingsCount'), { n: findings.length }))
          ),
          groups.map(function (group) {
            return h('div', { key: group.severity, className: 'rr-finding-group rr-sev-' + group.severity },
              h('div', { className: 'rr-finding-group-head' },
                h('span', { className: 'rr-dot rr-dot-' + group.severity }),
                h('span', { className: 'rr-finding-group-label' }, t('severity.' + group.severity)),
                h('span', { className: 'rr-finding-group-count' }, String(group.items.length))
              ),
              group.items.map(function (finding, index) {
                const title = asText(finding.title, t('finding.untitled'));
                const confidence = confidenceLabel(finding.confidence, t);
                const evidence = Array.isArray(finding.evidence)
                  ? finding.evidence
                  : (finding.evidence ? [finding.evidence] : []);
                const evidenceEntries = evidence.map(function (item) {
                  const path = isObject(item) ? asText(item.path, '') : asText(item, '');
                  const line = isObject(item) && item.line !== null && item.line !== undefined ? String(item.line) : '';
                  const reason = isObject(item) ? asText(item.reason, '') : '';
                  return { path: path, line: line, reason: reason };
                }).filter(function (item) { return item.path || item.reason; });
                return h('article', { key: group.severity + '-' + index, className: 'rr-finding rr-sev-' + group.severity },
                  h('div', { className: 'rr-finding-head' },
                    h('div', { className: 'rr-finding-title' }, title),
                    h('div', { className: 'rr-finding-tags' },
                      h('span', { className: 'rr-badge rr-sev-badge' }, t('severity.' + group.severity)),
                      confidence ? h('span', { className: 'rr-badge' }, t('finding.confidence') + ' ' + confidence) : null
                    )
                  ),
                  h('div', { className: 'rr-finding-fields' },
                    h(FindingField, { label: t('finding.trigger'), value: asText(finding.trigger, t('common.none')) }),
                    h(FindingField, { label: t('finding.systemFunction'), value: asText(finding.system_function, t('common.none')) }),
                    h(FindingField, { label: t('finding.consequence'), value: asText(finding.consequence, t('common.none')) }),
                    h(FindingField, { label: t('finding.verification'), value: asText(finding.verification, t('common.none')) })
                  ),
                  evidenceEntries.length > 0 ? h('div', { className: 'rr-evidence' },
                    h('div', { className: 'rr-evidence-label' }, t('finding.evidence')),
                    evidenceEntries.map(function (entry, evidenceIndex) {
                      const displayPath = entry.path + (entry.line ? ':' + entry.line : '');
                      return h('div', { key: evidenceIndex, className: 'rr-evidence-item' },
                        entry.path ? h('code', { className: 'rr-evidence-path' }, displayPath) : null,
                        entry.reason ? h('span', { className: 'rr-evidence-reason' }, entry.reason) : null
                      );
                    })
                  ) : null
                );
              })
            );
          })
        ) : h('div', { className: 'rr-no-findings' }, t('review.noFindings')),
        h(BulletBlock, { title: t('lists.affectedFlows'), items: asLines(review.affected_flows) }),
        h(BulletBlock, { title: t('lists.risksToVerify'), items: asLines(review.risks_to_verify) }),
        h(BulletBlock, { title: t('lists.coverageGaps'), items: asLines(review.coverage_gaps) }),
        h(BulletBlock, { title: t('lists.verificationPlan'), items: asLines(review.verification_plan) })
      );
    }

    function HealthNotice(props) {
      if (!isObject(props.health) || props.health.ok !== false) return null;
      const t = props.t;
      const message = asText(props.health.message || props.health.error, t('health.unknown'));
      return h('div', { className: 'rr-health', role: 'status' },
        h('span', { className: 'rr-health-icon' }, AlertIcon({ size: 13 })),
        h('span', null, fill(t('health.notReady'), { message: message }))
      );
    }

    function DetailView(props) {
      const t = props.t;
      const detail = isObject(props.detail) ? props.detail : {};
      const pr = isObject(detail.pr) ? detail.pr : {};
      const filesObject = isObject(detail.files) ? detail.files : {};
      const files = Array.isArray(filesObject.changed)
        ? filesObject.changed.map(function (file) { return asText(file, ''); }).filter(Boolean)
        : [];
      const review = isObject(detail.review) ? detail.review : null;
      const job = isObject(detail.job) ? detail.job : {};
      const metadata = review && isObject(review.metadata) ? review.metadata : {};
      const [showAllFiles, setShowAllFiles] = React.useState(false);
      const [descriptionOpen, setDescriptionOpen] = React.useState(false);

      const kind = reviewKind(review);
      const statusLabel = reviewStatusLabel(kind, t);
      const state = stateInfo(pr, t);
      const numberText = pr.number === null || pr.number === undefined ? '—' : String(pr.number);
      const title = asText(pr.title, t('common.unknown'));
      const authorObject = isObject(pr.author) ? pr.author : {};
      const authorName = asText(authorObject.name, '') || asText(authorObject.login, '') || t('common.unknown');
      const authorUrl = safeHttpUrl(authorObject.html_url);
      const prUrl = safeHttpUrl(pr.html_url);
      const sourceBranch = asText(pr.source_branch, t('common.unknown'));
      const targetBranch = asText(pr.target, t('common.unknown'));
      const metadataHead = asText(metadata.head_sha, '');
      const headSha = asText(pr.head_sha, '') || metadataHead;
      const baseSha = asText(pr.base_sha, '') || asText(metadata.base_sha, '');
      const reviewedHead = review ? (asText(review.reviewed_head_sha, '') || metadataHead) : '';
      const reviewedAt = review ? (review.reviewed_at || review.checked_at) : null;
      const reviewTime = reviewedAt ? (formatDate(reviewedAt) || t('common.none')) : t('common.none');
      const stale = review ? (reportExists(review) && (review.current === false || kind === 'stale')) : false;
      const staleReviewedSha = shortSha(reviewedHead) || t('common.unknown');
      const staleHeadSha = shortSha(headSha) || t('common.unknown');
      const staleExtra = review ? asText(review.stale_message, '') : '';
      const bodyText = typeof pr.body === 'string' ? pr.body : asText(pr.body, '');
      const longDescription = bodyText.length > 600;
      const descriptionCollapsed = longDescription && !descriptionOpen;
      const visibleFiles = showAllFiles ? files : files.slice(0, 8);
      const mergeable = mergeableLabel(pr.mergeable, t);
      const pipeline = asText(pr.pipeline_status, '') || t('common.unknown');
      const coverageCount = coverageGapCount(review);
      const findingsTotal = findingsCount(review);

      return h('div', { className: 'rr-detail' },
        h('div', { className: 'rr-detail-top' },
          h('div', { className: 'rr-detail-main' },
            h('div', { className: 'rr-detail-kicker' },
              h('span', { className: 'rr-num-lg' }, '#' + numberText),
              h('span', { className: 'rr-state rr-state-' + state.key }, state.label),
              h('span', { className: 'rr-review-badge is-' + kind }, statusLabel)
            ),
            h('h1', { className: 'rr-detail-title' }, title)
          ),
          prUrl ? h('div', { className: 'rr-detail-actions' },
            h('a', {
              className: 'rr-btn rr-btn-link',
              href: prUrl,
              target: '_blank',
              rel: 'noreferrer noopener',
              'aria-label': fill(t('aria.openPr'), { number: numberText }),
            }, ExternalIcon({ size: 13 }), t('detail.open'))
          ) : null
        ),
        h('div', { className: 'rr-detail-meta' },
          h('span', null,
            h('span', { className: 'rr-meta-key' }, t('detail.author') + ' '),
            authorUrl
              ? h('a', { className: 'rr-inline-link', href: authorUrl, target: '_blank', rel: 'noreferrer noopener' }, authorName)
              : authorName
          ),
          h('span', { className: 'rr-branches' },
            h('code', { className: 'rr-mono', title: sourceBranch }, sourceBranch),
            h('span', { className: 'rr-arrow' }, '→'),
            h('code', { className: 'rr-mono', title: targetBranch }, targetBranch)
          ),
          h('span', null,
            h('span', { className: 'rr-meta-key' }, t('detail.head') + ' '),
            h('code', { className: 'rr-mono', title: headSha }, shortSha(headSha) || t('common.unknown'))
          ),
          h('span', null,
            h('span', { className: 'rr-meta-key' }, t('detail.base') + ' '),
            h('code', { className: 'rr-mono', title: baseSha }, shortSha(baseSha) || t('common.unknown'))
          ),
          h('span', null,
            h('span', { className: 'rr-meta-key' }, t('detail.mergeable') + ' '),
            mergeable
          )
        ),
        stale ? h('div', { className: 'rr-stale', role: 'status' },
          h('span', { className: 'rr-stale-icon' }, AlertIcon({ size: 15 })),
          h('div', { className: 'rr-stale-body' },
            h('div', { className: 'rr-stale-title' }, t('stale.title')),
            h('div', { className: 'rr-stale-msg' }, fill(t('stale.message'), { reviewed: staleReviewedSha, head: staleHeadSha })),
            staleExtra ? h('div', { className: 'rr-stale-extra' }, staleExtra) : null
          )
        ) : null,
        h('div', { className: 'rr-meta-grid' },
          h(MetaCell, { label: t('meta.target'), fallback: t('common.unknown') }, h('code', { className: 'rr-mono' }, targetBranch)),
          h(MetaCell, { label: t('meta.reviewedAt'), fallback: t('common.none') }, reviewTime),
          h(MetaCell, { label: t('meta.commit'), fallback: t('common.none') },
            reviewedHead ? h('code', { className: 'rr-mono', title: reviewedHead }, shortSha(reviewedHead)) : t('common.none')
          ),
          h(MetaCell, { label: t('meta.status'), fallback: t('review.none') }, statusLabel),
          h(MetaCell, { label: t('meta.coverageGaps'), fallback: '0' }, String(coverageCount)),
          h(MetaCell, { label: t('meta.ci'), fallback: t('common.unknown') }, pipeline)
        ),
        h('section', { className: 'rr-section' },
          h('div', { className: 'rr-section-head' },
            h('h2', { className: 'rr-section-title' }, t('review.sectionTitle')),
            findingsTotal > 0 ? h('span', { className: 'rr-section-count' }, fill(t('review.findingsCount'), { n: findingsTotal })) : null
          ),
          h(ReviewBody, { review: review, job: job, t: t })
        ),
        h('section', { className: 'rr-section' },
          h('div', { className: 'rr-section-head' },
            h('h2', { className: 'rr-section-title' }, t('files.title')),
            files.length > 0 ? h('span', { className: 'rr-section-count' }, String(files.length)) : null
          ),
          files.length > 0
            ? h('div', { className: 'rr-files' }, visibleFiles.map(function (file, index) {
                return h('div', { key: String(index) + ':' + file, className: 'rr-file' }, file);
              }))
            : h('div', { className: 'rr-muted' }, t('files.none')),
          files.length > 8 ? h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm rr-toggle',
            onClick: function () { setShowAllFiles(function (value) { return !value; }); },
            'aria-expanded': showAllFiles ? 'true' : 'false',
            'aria-label': showAllFiles ? t('files.collapse') : fill(t('files.expand'), { n: files.length }),
            title: t('aria.filesToggle'),
          }, ChevronIcon({ size: 12, up: showAllFiles }), showAllFiles ? t('files.collapse') : fill(t('files.expand'), { n: files.length })) : null
        ),
        h('section', { className: 'rr-section' },
          h('div', { className: 'rr-section-head' },
            h('h2', { className: 'rr-section-title' }, t('desc.title'))
          ),
          h('div', { className: 'rr-pr-desc' },
            bodyText
              ? h('pre', {
                  className: 'rr-prbody' + (descriptionCollapsed ? ' is-collapsed' : ''),
                  tabIndex: 0,
                }, bodyText)
              : h('div', { className: 'rr-muted' }, t('detail.noDescription'))
          ),
          longDescription ? h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm rr-toggle',
            onClick: function () { setDescriptionOpen(function (value) { return !value; }); },
            'aria-expanded': descriptionOpen ? 'true' : 'false',
            'aria-label': descriptionOpen ? t('desc.collapse') : t('desc.expand'),
            title: t('aria.descriptionToggle'),
          }, ChevronIcon({ size: 12, up: descriptionOpen }), descriptionOpen ? t('desc.collapse') : t('desc.expand')) : null
        )
      );
    }

    function Page(props) {
      const t = props && typeof props.t === 'function' ? props.t : function (key) { return key; };
      const [listData, setListData] = React.useState(null);
      const [listLoading, setListLoading] = React.useState(true);
      const [listError, setListError] = React.useState('');
      const [reloadKey, setReloadKey] = React.useState(0);
      const [selected, setSelected] = React.useState(null);
      const [detail, setDetail] = React.useState(null);
      const [detailLoading, setDetailLoading] = React.useState(false);
      const [detailError, setDetailError] = React.useState('');
      const [detailReloadKey, setDetailReloadKey] = React.useState(0);
      const [query, setQuery] = React.useState('');
      const [stateFilter, setStateFilter] = React.useState('all');
      const [view, setView] = React.useState('list');
      const [health, setHealth] = React.useState(null);

      React.useEffect(function () {
        let active = true;
        const controller = new AbortController();
        setListLoading(true);
        setListError('');
        (async function () {
          try {
            const data = await fetchJSON(API_BASE + '/pulls' + (reloadKey > 0 ? '?refresh=1' : ''), controller.signal);
            if (!active) return;
            if (!isObject(data)) throw new Error('Invalid response');
            const prs = Array.isArray(data.prs) ? data.prs : [];
            setListData(data);
            setSelected(function (previous) {
              if (previous === null || previous === undefined) return previous;
              const present = prs.some(function (pr) {
                return isObject(pr) && pr.number === previous;
              });
              return present ? previous : null;
            });
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setListError(errorText(error));
          } finally {
            if (active) setListLoading(false);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [reloadKey]);

      React.useEffect(function () {
        let active = true;
        const controller = new AbortController();
        (async function () {
          try {
            const data = await fetchJSON(API_BASE + '/health', controller.signal);
            if (!active) return;
            setHealth(isObject(data) ? data : null);
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setHealth(null);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [reloadKey]);

      React.useEffect(function () {
        if (selected === null || selected === undefined) {
          setDetail(null);
          setDetailError('');
          setDetailLoading(false);
          return undefined;
        }
        let active = true;
        const controller = new AbortController();
        setDetail(null);
        setDetailError('');
        setDetailLoading(true);
        (async function () {
          try {
            const data = await fetchJSON(API_BASE + '/pulls/' + encodeURIComponent(String(selected)) + (detailReloadKey > 0 ? '?refresh=1' : ''), controller.signal);
            if (!active) return;
            if (!isObject(data)) throw new Error('Invalid response');
            setDetail(data);
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setDetailError(errorText(error));
          } finally {
            if (active) setDetailLoading(false);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [selected, detailReloadKey]);

      React.useEffect(function () {
        if (selected === null || selected === undefined) setView('list');
      }, [selected]);

      const prs = listData && Array.isArray(listData.prs) ? listData.prs.filter(isObject) : [];
      const normalizedQuery = query.trim().toLowerCase();
      const filteredPrs = prs.filter(function (pr) {
        if (stateFilter !== 'all') {
          const kind = reviewKind(isObject(pr.review) ? pr.review : null);
          if (stateFilter === 'pending' && kind !== 'none' && kind !== 'running' && kind !== 'failed') return false;
          if (stateFilter === 'reviewed' && kind !== 'current' && kind !== 'stale') return false;
          if (stateFilter === 'issues' && findingsCount(isObject(pr.review) ? pr.review : null) <= 0) return false;
        }
        if (!normalizedQuery) return true;
        const author = isObject(pr.author)
          ? (asText(pr.author.name, '') + ' ' + asText(pr.author.login, ''))
          : '';
        const haystack = [
          asText(pr.number, ''),
          asText(pr.title, ''),
          author,
        ].join(' ').toLowerCase();
        return haystack.indexOf(normalizedQuery) >= 0;
      });
      const rawCounts = listData && isObject(listData.counts) ? listData.counts : {};
      const reviewedFallback = prs.filter(function (pr) {
        const kind = reviewKind(isObject(pr.review) ? pr.review : null);
        return kind === 'current' || kind === 'stale';
      }).length;
      const staleFallback = prs.filter(function (pr) {
        return reviewKind(isObject(pr.review) ? pr.review : null) === 'stale';
      }).length;
      const totalCount = Math.max(0, numberOr(rawCounts.total, prs.length));
      const reviewedCount = Math.max(0, numberOr(rawCounts.reviewed, reviewedFallback));
      const staleCount = Math.max(0, numberOr(rawCounts.stale, staleFallback));
      const sourceLive = !!(listData && listData.source === 'live');
      const sourceLabel = !listData
        ? t('common.loading')
        : sourceLive ? t('source.live') : t('source.cache');
      const sourceError = listData ? asText(listData.source_error, '') : '';
      const repoObject = listData && isObject(listData.repo) ? listData.repo : {};
      const repoId = asText(repoObject.id, t('common.unknown'));
      const generated = listData && listData.generated_at ? formatDate(listData.generated_at) : t('common.none');
      const activeFilters = normalizedQuery !== '' || stateFilter !== 'all';

      function refresh() {
        setReloadKey(function (value) { return value + 1; });
      }

      function retryDetail() {
        setDetailReloadKey(function (value) { return value + 1; });
      }

      function selectPr(number) {
        if (number === null || number === undefined) return;
        setSelected(number);
        setView('detail');
      }

      function clearFilters() {
        setQuery('');
        setStateFilter('all');
      }

      function goBack() {
        setView('list');
      }

      const listChildren = [];
      if (listError) {
        listChildren.push(h('div', { key: 'error', className: 'rr-banner', role: 'alert' },
          h('div', { className: 'rr-banner-main' },
            h('div', { className: 'rr-banner-title' }, t('list.errorTitle')),
            h('div', { className: 'rr-banner-text' }, listError || t('list.errorHint'))
          ),
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm',
            onClick: refresh,
            disabled: listLoading,
            'aria-label': t('action.retry'),
          }, t('action.retry'))
        ));
      }
      if (listLoading && !listData) {
        listChildren.push(h(ListSkeleton, { key: 'skeleton', t: t }));
      } else if (prs.length === 0) {
        if (!listError) {
          listChildren.push(h(EmptyState, {
            key: 'empty',
            icon: NavIcon({ size: 24 }),
            title: t('list.empty'),
            hint: t('list.emptyHint'),
          }));
        }
      } else if (filteredPrs.length === 0) {
        listChildren.push(h(EmptyState, {
          key: 'nomatch',
          icon: SearchIcon({ size: 22 }),
          title: t('list.noMatch'),
          hint: t('list.noMatchHint'),
          action: h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm',
            onClick: clearFilters,
          }, t('action.clearFilters')),
        }));
      } else {
        filteredPrs.forEach(function (pr, index) {
          listChildren.push(h(PrRow, {
            key: pr.number === null || pr.number === undefined ? 'pr-' + index : String(pr.number),
            pr: pr,
            t: t,
            selected: selected === pr.number,
            onSelect: selectPr,
          }));
        });
      }

      let detailContent;
      if (selected === null || selected === undefined) {
        detailContent = h(EmptyState, {
          icon: NavIcon({ size: 28 }),
          title: t('detail.emptyTitle'),
          hint: t('detail.emptyHint'),
        });
      } else if (detailLoading) {
        detailContent = h(DetailSkeleton, { t: t });
      } else if (detailError) {
        detailContent = h('div', { className: 'rr-state-card' },
          h(EmptyState, {
            icon: AlertIcon({ size: 24 }),
            title: t('detail.errorTitle'),
            hint: detailError || t('detail.errorHint'),
            action: h('button', {
              type: 'button',
              className: 'rr-btn rr-btn-sm',
              onClick: retryDetail,
            }, t('action.retry')),
          })
        );
      } else if (!detail || !isObject(detail.pr)) {
        detailContent = h('div', { className: 'rr-state-card' },
          h(EmptyState, {
            icon: AlertIcon({ size: 24 }),
            title: t('detail.missing'),
            hint: t('detail.missingHint'),
            action: h('button', {
              type: 'button',
              className: 'rr-btn rr-btn-sm',
              onClick: retryDetail,
            }, t('action.retry')),
          })
        );
      } else {
        detailContent = h(DetailView, { key: String(selected), detail: detail, t: t });
      }

      return h('div', { className: 'rr-page', 'data-view': view },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('header', { className: 'rr-head' },
          h('div', { className: 'rr-head-main' },
            h('div', { className: 'rr-head-title' },
              h('span', { className: 'rr-logo' }, NavIcon({ size: 17 })),
              h('h1', { className: 'rr-title' }, t('title')),
              h('span', { className: 'rr-repo', title: repoId }, repoId)
            ),
            h('div', { className: 'rr-head-meta' },
              h('span', {
                className: 'rr-source' + (sourceLive ? ' is-live' : ''),
                title: sourceError || (t('source.label') + ': ' + sourceLabel),
              },
                h('span', { className: 'rr-source-dot' }),
                sourceLabel
              ),
              h('span', { className: 'rr-generated' }, t('header.generatedAt') + ' ' + generated)
            )
          ),
          h('div', { className: 'rr-head-actions' },
            h('button', {
              type: 'button',
              className: 'rr-btn',
              onClick: refresh,
              disabled: listLoading,
              'aria-label': t('aria.refresh'),
              title: t('aria.refresh'),
            },
              h('span', { className: 'rr-icon' + (listLoading ? ' rr-spin' : '') }, RefreshIcon({ size: 14 })),
              h('span', null, t('action.refresh'))
            )
          )
        ),
        h('div', { className: 'rr-body' },
          h('aside', { className: 'rr-listpane', 'aria-label': t('aria.prList') },
            h('div', { className: 'rr-controls' },
              h('div', { className: 'rr-search-wrap' },
                h('span', { className: 'rr-search-icon' }, SearchIcon({ size: 13 })),
                h('input', {
                  type: 'search',
                  className: 'rr-search',
                  value: query,
                  placeholder: t('filter.searchPlaceholder'),
                  'aria-label': t('filter.searchAria'),
                  onChange: function (event) { setQuery(event && event.target ? event.target.value : ''); },
                })
              ),
              h('div', { className: 'rr-chips', role: 'group', 'aria-label': t('aria.filters') },
                FILTERS.map(function (filter) {
                  const pressed = stateFilter === filter.id;
                  return h('button', {
                    key: filter.id,
                    type: 'button',
                    className: 'rr-chip',
                    'aria-pressed': pressed ? 'true' : 'false',
                    onClick: function () { setStateFilter(filter.id); },
                  }, t(filter.label));
                })
              ),
              listData ? h('div', { className: 'rr-counts' },
                fill(t('list.counts'), { total: totalCount, reviewed: reviewedCount, stale: staleCount })
              ) : null,
              sourceError ? h('div', { className: 'rr-cache-warn' },
                t('list.cacheWarning') + sourceError
              ) : null
            ),
            h('div', { className: 'rr-list-scroll' }, listChildren)
          ),
          h('section', { className: 'rr-detailpane' },
            h('div', { className: 'rr-detail-inner' },
              selected !== null && selected !== undefined ? h('button', {
                type: 'button',
                className: 'rr-btn rr-btn-sm rr-back',
                onClick: goBack,
                'aria-label': t('detail.back'),
              }, BackIcon({ size: 13 }), t('detail.back')) : null,
              detailContent,
              h(HealthNotice, { health: health, t: t })
            )
          )
        )
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'recsdk-review: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'recsdk-review: en dictionary');
        let t = (key) => key;
        try { t = ctx.locale.bind(NS); } catch {}
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t }) },
          (props) => Page({ ...props, t })
        ));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('nav'), locale: NS },
          (owner = {}) => NavIcon({ size: owner.size ?? 16 })
        ));
      },
    };
  },
});
