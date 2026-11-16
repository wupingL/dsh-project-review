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
      'review.start': '开始审查',
      'review.reviewAgain': '重新审查',
      'review.retry': '重试审查',
      'review.runningHint': '正在后台执行：获取提交、同步知识、调用模型审查，可能需要几分钟；完成后自动刷新。',
      'review.startHint': '点击后在后台执行：同步目标分支/base 知识 → 自动选择快速或深度审查 → 调用 Harness 模型审查 → 生成报告。',
      'review.deep': '深度审查',
      'review.deepHint': '对变更源码做完整语义领域分析，较慢；自动模式在变更文件未被源码索引（如 patch/文档）时直接走快速审查。',
      'review.fastBadge': '快速审查',
      'review.deepBadge': '深度审查',
      'comparison.title': '与上一版对比',
      'comparison.summary': '已修复 {fixed} · 仍存在 {open} · 新增 {new}',
      'comparison.previous': '上一版审查 head：{sha}',
      'comparison.fixedTitle': '已修复',
      'comparison.openTitle': '仍存在 / 部分修复',
      'comment.select': '选择该审查意见',
      'comment.selected': '已选 {n} 条',
      'comment.mode': '评论口径',
      'comment.mode.issue': '问题',
      'comment.mode.suggestion': '建议',
      'comment.mode.question': '疑问',
      'comment.submit': '提交评论到 PR',
      'comment.hint': '勾选意见后先预览，再确认提交到 PR 对应代码处',
      'comment.posting': '提交中…',
      'comment.previewTitle': '确认要提交的评论',
      'comment.previewHint': '以下 {n} 条将提交到 PR；不在 diff 新增行的会作为 PR 级评论。',
      'comment.confirm': '确认提交',
      'comment.cancel': '取消',
      'comment.postedBadge': '已评论',
      'comment.inline': '行内',
      'comment.general': 'PR 评论',
      'comment.resultTitle': '评论提交完成',
      'comment.resultSummary': '成功 {posted} 条，失败 {failed} 条。',
      'comment.failed': '评论提交失败',
      'review.modelRequired': '模型路由未就绪，无法执行审查（请到「模型配置」使用 Harness 模型）',
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
      'view.projects': '项目总览',
      'action.import': '导入项目',
      'action.open': '打开',
      'action.backToProjects': '项目',
      'action.check': '检查更新',
      'action.cancel': '取消',
      'projects.loading': '正在载入项目',
      'projects.empty': '还没有加载任何项目',
      'projects.emptyHint': '点击「导入项目」，填写 GitCode/GitHub 的 HTTPS 仓库地址。',
      'projects.errorTitle': '项目列表加载失败',
      'projects.errorHint': '无法读取项目注册表，请重试。',
      'projects.branchCount': '{n} 个分支',
      'project.active': '当前',
      'project.copyPath': '点击复制路径',
      'knowledge.title': '知识库',
      'knowledge.status.missing': '未构建',
      'knowledge.status.stale': '有更新',
      'knowledge.status.current': '已最新',
      'knowledge.remote': '远端',
      'knowledge.snapshot': '快照',
      'knowledge.none': '未构建',
      'knowledge.semantic': '语义',
      'knowledge.structural': '结构',
      'knowledge.structuralOnly': '结构索引',
      'knowledge.behind': '落后 {n} 个提交',
      'knowledge.domains': '{n} 个领域',
      'knowledge.checking': '正在检查…',
      'knowledge.syncStructural': '更新结构索引',
      'knowledge.syncSemantic': '语义同步',
      'knowledge.semanticDisabled': '语义同步不可用：{reason}',
      'knowledge.missingHint': '该分支还没有知识库快照，可先构建结构索引。',
      'knowledge.staleHint': '远端有新提交，知识库需要更新。',
      'knowledge.currentHint': '知识库与远端一致。',
      'knowledge.pathSnapshot': '知识库',
      'knowledge.pathMirror': '代码镜像',
      'knowledge.copyPath': '点击复制路径',
      'knowledge.running': '同步中…',
      'knowledge.progress': '同步进度',
      'knowledge.synced': '已同步：{sha}',
      'knowledge.failed': '同步失败：{message}',
      'knowledge.structuralDone': '结构索引已更新：{sha}',
      'branch.label': '分支',
      'import.title': '导入项目',
      'import.url': '仓库地址',
      'import.urlHint': 'HTTPS 地址，例如 https://gitcode.com/owner/repo',
      'import.name': '项目名称',
      'import.nameHint': '留空则使用仓库名',
      'import.local': '本地 clone 路径（可选）',
      'import.localHint': '填写已存在的本地仓库可避免重新下载，且必须与地址一致',
      'import.branches': '分支',
      'import.probe': '读取分支',
      'import.probing': '读取中…',
      'import.submit': '导入',
      'import.importing': '导入中…',
      'import.existing': '该项目已经加载过，已为你打开。',
      'import.urlInvalid': '请输入以 https:// 开头的仓库地址',
      'import.branchRequired': '请至少选择一个分支',
      'import.probeFirst': '请先点「读取分支」，或直接导入（默认分支）',
      'aria.projects': '项目列表',
      'aria.import': '导入项目对话框',
      'aria.branch': '切换分支',
      'aria.knowledge': '知识库状态',
      'aria.close': '关闭',
      'action.model': '模型配置',
      'knowledge.hideLogs': '收起同步日志',
      'knowledge.showLogs': '查看同步日志',
      'settings.title': '控制器模型配置',
      'settings.sub': '从 DeepSeek Harness 已配置的模型中选择，写入控制器使用的路由；凭据仍由环境变量或凭证文件提供。',
      'settings.harnessProvider': 'Harness 提供方',
      'settings.harnessModel': '模型',
      'settings.modelOverride': '或手动填写模型名',
      'settings.baseUrl': '接口地址',
      'settings.baseUrlHint': 'OpenAI 兼容接口的基地址（https），例如 https://api.deepseek.com/v1',
      'settings.endpointId': '端点标识',
      'settings.credentialEnv': '凭据环境变量',
      'settings.protocol': '协议',
      'settings.save': '保存配置',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.loading': '正在读取模型列表…',
      'settings.ready': '模型路由已就绪',
      'settings.notReady': '模型路由未就绪',
      'settings.credential': '凭据',
      'settings.present': '已提供',
      'settings.missing': '缺失',
      'settings.harnessUnavailable': 'Harness 模型清单不可用：{reason}',
      'settings.noProvider': '当前 Harness 配置里没有可用于控制器的提供方（需要 OpenAI 兼容 base_url + 模型列表）',
      'settings.apply': '保存并启用',
      'settings.test': '测试连接',
      'settings.testOk': '连接正常：{n} 个模型，{ms} ms',
      'settings.testFailed': '连接失败',
      'settings.testSkipped': '未测试',
      'settings.keyAlready': '已保存（留空则不修改）',
      'settings.currentModel': 'Harness 当前启用的模型',
      'settings.errorTitle': '模型配置加载失败',
      'settings.useHarness': '使用 Harness 当前模型（免配置）',
      'settings.useHarnessHint': '直接把控制器路由指向本插件内置的宿主模型桥，复用 Harness 的模型与凭据，无需填写任何 API Key。',
      'settings.orManual': '或手动指定提供方',
      'settings.back': '返回',
      'settings.incompatibleHint': '该提供方未提供 OpenAI 兼容地址，请手动填写',
      'settings.apiKey': 'API Key（仅此项需要填写）',
      'settings.apiKeyHint': '留空表示不修改；只写入本机状态目录的凭据文件，不进入项目配置或日志',
      'settings.saveKey': '保存 API Key',
      'settings.clearKey': '清除',
      'settings.keySaved': 'API Key 已保存',
      'settings.keyCleared': 'API Key 已清除',
      'settings.autoFilled': '提供方、模型、接口地址与凭据变量已按 Harness 配置自动填写',
      'settings.savedRoute': '已保存路由',
      'settings.needModel': '请填写或选择模型',
      'settings.needBaseUrl': '请填写接口地址（https）',
      'settings.needKeyForManual': '手动配置外部网关时需要填写该网关的 API Key；只想用 Harness 模型请点上方「使用 Harness 当前模型」',
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
      'review.start': 'Start review',
      'review.reviewAgain': 'Review again',
      'review.retry': 'Retry review',
      'review.runningHint': 'Running in the background: fetching commits, syncing knowledge and calling the model; this can take a few minutes and refreshes automatically.',
      'review.startHint': 'Runs in the background: sync the target branch/base knowledge → pick quick or deep review automatically → Harness model review → report.',
      'review.deep': 'Deep review',
      'review.deepHint': 'Full semantic domain analysis of the changed source (slower). Auto mode reviews quickly when the changed files are not source-indexed (patches, docs).',
      'review.fastBadge': 'Quick review',
      'review.deepBadge': 'Deep review',
      'comparison.title': 'Changes since last review',
      'comparison.summary': '{fixed} fixed · {open} open · {new} new',
      'comparison.previous': 'Last reviewed head: {sha}',
      'comparison.fixedTitle': 'Fixed',
      'comparison.openTitle': 'Still open / partially fixed',
      'comment.select': 'Select this finding',
      'comment.selected': '{n} selected',
      'comment.mode': 'Comment tone',
      'comment.mode.issue': 'Issue',
      'comment.mode.suggestion': 'Suggestion',
      'comment.mode.question': 'Question',
      'comment.submit': 'Post to PR',
      'comment.hint': 'Select findings, preview the comments, then confirm to post them at the matching code lines',
      'comment.posting': 'Posting…',
      'comment.previewTitle': 'Confirm comments to post',
      'comment.previewHint': '{n} comment(s) will be posted; ones whose line is not in the diff become PR-level comments.',
      'comment.confirm': 'Post comments',
      'comment.cancel': 'Cancel',
      'comment.postedBadge': 'Posted',
      'comment.inline': 'inline',
      'comment.general': 'PR comment',
      'comment.resultTitle': 'Comments posted',
      'comment.resultSummary': '{posted} posted, {failed} failed.',
      'comment.failed': 'Posting comments failed',
      'review.modelRequired': 'Model route is not ready (open Model route and use the Harness model)',
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
      'view.projects': 'Projects',
      'action.import': 'Import project',
      'action.open': 'Open',
      'action.backToProjects': 'Projects',
      'action.check': 'Check',
      'action.cancel': 'Cancel',
      'projects.loading': 'Loading projects',
      'projects.empty': 'No project loaded yet',
      'projects.emptyHint': 'Use “Import project” and enter an HTTPS Git URL.',
      'projects.errorTitle': 'Could not load projects',
      'projects.errorHint': 'The project registry is unreadable. Retry.',
      'projects.branchCount': '{n} branches',
      'project.active': 'Active',
      'project.copyPath': 'Click to copy the path',
      'knowledge.title': 'Knowledge',
      'knowledge.status.missing': 'Not built',
      'knowledge.status.stale': 'Out of date',
      'knowledge.status.current': 'Up to date',
      'knowledge.remote': 'Remote',
      'knowledge.snapshot': 'Snapshot',
      'knowledge.none': 'Not built',
      'knowledge.semantic': 'Semantic',
      'knowledge.structural': 'Structural',
      'knowledge.structuralOnly': 'Structural index',
      'knowledge.behind': '{n} commits behind',
      'knowledge.domains': '{n} domains',
      'knowledge.checking': 'Checking…',
      'knowledge.syncStructural': 'Update structural index',
      'knowledge.syncSemantic': 'Semantic sync',
      'knowledge.semanticDisabled': 'Semantic sync unavailable: {reason}',
      'knowledge.missingHint': 'This branch has no knowledge snapshot yet. Build a structural index first.',
      'knowledge.staleHint': 'The remote has newer commits; the knowledge base needs an update.',
      'knowledge.currentHint': 'The knowledge base matches the remote tip.',
      'knowledge.pathSnapshot': 'Knowledge',
      'knowledge.pathMirror': 'Code mirror',
      'knowledge.copyPath': 'Click to copy the path',
      'knowledge.running': 'Syncing…',
      'knowledge.progress': 'Progress',
      'knowledge.synced': 'Synced: {sha}',
      'knowledge.failed': 'Sync failed: {message}',
      'knowledge.structuralDone': 'Structural index updated: {sha}',
      'branch.label': 'Branch',
      'import.title': 'Import project',
      'import.url': 'Repository URL',
      'import.urlHint': 'HTTPS URL, e.g. https://gitcode.com/owner/repo',
      'import.name': 'Project name',
      'import.nameHint': 'Defaults to the repository name',
      'import.local': 'Local clone path (optional)',
      'import.localHint': 'An existing clone avoids a fresh download and must match the URL',
      'import.branches': 'Branches',
      'import.probe': 'Read branches',
      'import.probing': 'Reading…',
      'import.submit': 'Import',
      'import.importing': 'Importing…',
      'import.existing': 'That project was already loaded; opening it.',
      'import.urlInvalid': 'Enter an HTTPS repository URL',
      'import.branchRequired': 'Select at least one branch',
      'import.probeFirst': 'Use “Read branches”, or import with the default branch',
      'aria.projects': 'Project list',
      'aria.import': 'Import project dialog',
      'aria.branch': 'Switch branch',
      'aria.knowledge': 'Knowledge base status',
      'aria.close': 'Close',
      'action.model': 'Model route',
      'knowledge.hideLogs': 'Hide sync log',
      'knowledge.showLogs': 'Show sync log',
      'settings.title': 'Controller model route',
      'settings.sub': 'Pick a model already configured in DeepSeek Harness and store the route the controller uses; credentials still come from the environment or a credential file.',
      'settings.harnessProvider': 'Harness provider',
      'settings.harnessModel': 'Model',
      'settings.modelOverride': 'Or type a model id',
      'settings.baseUrl': 'Base URL',
      'settings.baseUrlHint': 'OpenAI-compatible base URL (https), e.g. https://api.deepseek.com/v1',
      'settings.endpointId': 'Endpoint id',
      'settings.credentialEnv': 'Credential env var',
      'settings.protocol': 'Protocol',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.loading': 'Loading models…',
      'settings.ready': 'Model route ready',
      'settings.notReady': 'Model route not ready',
      'settings.credential': 'Credential',
      'settings.present': 'present',
      'settings.missing': 'missing',
      'settings.harnessUnavailable': 'Harness model catalog unavailable: {reason}',
      'settings.noProvider': 'No provider in the Harness configuration is usable by the controller (needs an OpenAI-compatible base URL plus models)',
      'settings.apply': 'Save and enable',
      'settings.test': 'Test connection',
      'settings.testOk': 'Connected: {n} models in {ms} ms',
      'settings.testFailed': 'Connection failed',
      'settings.testSkipped': 'Not tested',
      'settings.keyAlready': 'Saved (empty keeps it)',
      'settings.currentModel': 'Model currently enabled in Harness',
      'settings.errorTitle': 'Could not load the model settings',
      'settings.useHarness': 'Use the Harness model (no setup)',
      'settings.useHarnessHint': 'Points the controller at this plugin\'s host-model bridge, reusing the Harness model and credentials; no API key needed.',
      'settings.orManual': 'Or pick a provider manually',
      'settings.back': 'Back',
      'settings.incompatibleHint': 'This provider exposes no OpenAI-compatible base URL; enter one manually',
      'settings.apiKey': 'API key (the only field you need to fill)',
      'settings.apiKeyHint': 'Empty means unchanged; stored only in a local credential file, never in project config or logs',
      'settings.saveKey': 'Save API key',
      'settings.clearKey': 'Clear',
      'settings.keySaved': 'API key saved',
      'settings.keyCleared': 'API key cleared',
      'settings.autoFilled': 'Provider, model, base URL and credential variable are filled from the Harness configuration',
      'settings.savedRoute': 'Saved route',
      'settings.needModel': 'Choose or enter a model',
      'settings.needBaseUrl': 'Enter a base URL (https)',
      'settings.needKeyForManual': 'A manual external gateway needs its own API key; to use the Harness model instead, click “Use the Harness model” above',
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
/* ---- 项目总览 / 导入 / 知识库 ---- */
.rr-page .rr-landing {
  min-height: 0;
  overflow: auto;
  padding: 20px 20px 32px;
  background: var(--dsw-alias-bg-base);
}
.rr-page .rr-landing-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.rr-page .rr-landing-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.rr-page .rr-landing-sub { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.rr-page .rr-landing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.rr-page .rr-project-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0;
}
.rr-page .rr-project-card.is-active { border-color: var(--dsw-alias-brand-primary); }
.rr-page .rr-project-card.has-error { border-color: var(--rr-critical); }
.rr-page .rr-project-card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rr-page .rr-project-name {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rr-page .rr-project-repo {
  display: block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}
.rr-page .rr-project-path {
  display: block;
  color: var(--dsw-alias-label-caption);
  font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.rr-page .rr-project-path:hover { color: var(--dsw-alias-link); }
.rr-page .rr-knowledge-paths {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 2px;
  min-width: 0;
}
.rr-page .rr-knowledge-path {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  font-size: 10.5px;
  color: var(--dsw-alias-label-caption);
  cursor: pointer;
}
.rr-page .rr-knowledge-path:hover code { color: var(--dsw-alias-link); }
.rr-page .rr-knowledge-path-label { flex: none; }
.rr-page .rr-knowledge-path code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
.rr-page a.rr-project-repo:hover { color: var(--dsw-alias-link); }
.rr-page .rr-project-error { color: var(--rr-critical); font-size: 11.5px; overflow-wrap: anywhere; }
.rr-page .rr-branch-lines { display: flex; flex-direction: column; gap: 2px; }
.rr-page .rr-branch-line { display: flex; gap: 8px; align-items: baseline; font-size: 11.5px; min-width: 0; }
.rr-page .rr-branch-name { color: var(--dsw-alias-label-secondary); flex: none; }
.rr-page .rr-project-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-tag {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
}
.rr-page .rr-tag-brand { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.rr-page .rr-tag-warn { border-color: var(--rr-high); color: var(--rr-high); }
.rr-page .rr-btn-primary {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.rr-page .rr-btn-primary:hover { background: var(--dsw-alias-brand-primary); opacity: .9; }
.rr-page .rr-btn-primary:disabled { opacity: .5; }
.rr-page .rr-skeleton-card { min-height: 132px; }
.rr-page .rr-skeleton-line { height: 12px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3); animation: rr-pulse 1.4s ease-in-out infinite; }
.rr-page .rr-skeleton-w40 { width: 40%; }
.rr-page .rr-skeleton-w60 { width: 60%; }
.rr-page .rr-skeleton-w80 { width: 80%; }
.rr-page .rr-workspace {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.rr-page .rr-knowledge {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.rr-page .rr-knowledge-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rr-page .rr-knowledge-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.rr-page .rr-knowledge-label { font-weight: 600; font-size: 12px; color: var(--dsw-alias-label-primary); }
.rr-page .rr-knowledge-badge {
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-base);
}
.rr-page .rr-knowledge-badge.is-current { border-color: #1f9d55; color: #1f9d55; }
.rr-page .rr-knowledge-badge.is-stale { border-color: var(--rr-high); color: var(--rr-high); }
.rr-page .rr-knowledge-badge.is-missing { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-tertiary); }
.rr-page .rr-knowledge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  min-width: 0;
}
.rr-page .rr-knowledge-hint { color: var(--dsw-alias-label-secondary); }
.rr-page .rr-knowledge-note { color: var(--rr-high); font-size: 11px; overflow-wrap: anywhere; }
.rr-page .rr-knowledge-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; justify-content: flex-end; }
.rr-page .rr-knowledge-notice { flex-basis: 100%; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.rr-page .rr-knowledge-progress {
  margin-top: 2px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  max-height: 116px;
  overflow: auto;
}
.rr-page .rr-knowledge-progress-label { color: var(--dsw-alias-label-caption); font-size: 10.5px; margin-bottom: 2px; }
.rr-page .rr-knowledge-progress-line {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  overflow-wrap: anywhere;
}
.rr-page .rr-notice {
  padding: 6px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-link);
  font-size: 11.5px;
}
.rr-page .rr-branch-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  min-height: 28px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
}
.rr-page .rr-branch-select-icon { display: inline-flex; flex: none; }
.rr-page .rr-select {
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  min-width: 90px;
  max-width: 200px;
  outline: none;
  cursor: pointer;
}
.rr-page .rr-visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0;
}
.rr-page .rr-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.rr-page .rr-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.rr-page .rr-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, .42);
}
.rr-page .rr-modal {
  width: min(560px, 100%);
  max-height: min(84vh, 720px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .35);
  overflow: hidden;
}
.rr-page .rr-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-modal-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.rr-page .rr-modal-body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.rr-page .rr-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.rr-page .rr-field { display: flex; flex-direction: column; gap: 4px; }
.rr-page .rr-field-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rr-page .rr-field-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.rr-page .rr-field-hint { font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.rr-page .rr-input {
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.rr-page .rr-input:hover { border-color: var(--dsw-alias-border-l2); }
.rr-page .rr-input:focus { border-color: var(--dsw-alias-brand-primary); }
.rr-page .rr-input::placeholder { color: var(--dsw-alias-label-caption); }
.rr-page .rr-branch-picker { display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow: auto; }
.rr-page .rr-chip.is-on { background: var(--dsw-alias-bg-layer-3); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); }
.rr-page .rr-form-error { color: var(--rr-critical); font-size: 11.5px; overflow-wrap: anywhere; }
.rr-page .rr-review-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.rr-page .rr-review-actions-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.rr-page .rr-errorbox-sm { margin-top: 0; }
.rr-page .rr-review-progress { margin-top: 0; max-height: 132px; }
.rr-page .rr-settings {
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 28px;
  background: var(--dsw-alias-bg-base);
}
.rr-page .rr-settings-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rr-page .rr-settings-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.rr-page .rr-settings-sub { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
.rr-page .rr-settings-card {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.rr-page .rr-settings-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; align-items: center; }
.rr-page .rr-settings-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.rr-page .rr-settings-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.rr-page .rr-settings-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-caption);
  font-size: 10.5px;
}
.rr-page .rr-settings-divider::before,
.rr-page .rr-settings-divider::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: var(--dsw-alias-border-l1);
}
.rr-page .rr-settings-status { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.rr-page .rr-settings-status .is-ok { color: #1f9d55; }
.rr-page .rr-settings-status .is-warn { color: var(--rr-high); }
.rr-page .rr-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.rr-page .rr-badge.is-ok { border-color: #1f9d55; color: #1f9d55; }
.rr-page .rr-badge.is-warn { border-color: var(--rr-high); color: var(--rr-high); }
.rr-page .rr-knowledge-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
.rr-page .rr-log-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px; height: 18px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.rr-page .rr-log-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.rr-page .rr-log-toggle { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-link); font: inherit; font-size: 11px; cursor: pointer; }
.rr-page .rr-log-toggle:hover { text-decoration: underline; }
@media (max-width: 700px) {
  .rr-page .rr-settings-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
}
@media (max-width: 900px) {
  .rr-page .rr-body { grid-template-columns: minmax(0, 1fr); }
  .rr-page .rr-listpane { border-right: 0; }
  .rr-page[data-pane="list"] .rr-detailpane { display: none; }
  .rr-page[data-pane="detail"] .rr-listpane { display: none; }
  .rr-page[data-pane="detail"] .rr-back { display: inline-flex; }
  .rr-page .rr-head { padding: 10px 12px; }
  .rr-page .rr-detail-inner { padding: 12px 14px 24px; }
  .rr-page .rr-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rr-page .rr-repo { max-width: 200px; }
  .rr-page .rr-knowledge { flex-direction: column; }
  .rr-page .rr-knowledge-actions { justify-content: flex-start; }
  .rr-page .rr-knowledge-notice { text-align: left; }
  .rr-page .rr-landing { padding: 14px 12px 24px; }
  .rr-page .rr-landing-grid { grid-template-columns: minmax(0, 1fr); }
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

    /** 点击路径文字即可复制；失败时静默（无剪贴板权限）。 */
    function copyText(text, t) {
      if (!text) return;
      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(function () {});
        }
      } catch (ignored) {
        /* ignore */
      }
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
      (Array.isArray(findings) ? findings : []).forEach(function (finding, index) {
        const safeFinding = isObject(finding) ? finding : {};
        groups[normalizeSeverity(safeFinding.severity)].push({ finding: safeFinding, index: index });
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

    function ComparisonBlock(props) {
      const t = props.t;
      const comparison = isObject(props.comparison) ? props.comparison : null;
      if (!comparison) return null;
      const fixed = Array.isArray(comparison.fixed) ? comparison.fixed : [];
      const open = Array.isArray(comparison.open) ? comparison.open : [];
      const fresh = Array.isArray(comparison.new) ? comparison.new : [];
      function renderItems(items) {
        return h('ul', { className: 'rr-bullets' }, items.map(function (item, index) {
          const evidence = Array.isArray(item.evidence) && item.evidence.length ? item.evidence[0] : null;
          return h('li', { key: index },
            (item.severity ? '[' + item.severity + '] ' : '') + asText(item.title, ''),
            item.reason ? ' — ' + asText(item.reason, '') : null,
            evidence && evidence.path
              ? h('code', { className: 'rr-evidence-path' },
                  asText(evidence.path, '') + (evidence.line ? ':' + String(evidence.line) : ''))
              : null);
        }));
      }
      return h('div', { className: 'rr-list-block rr-comparison' },
        h('div', { className: 'rr-list-label' }, t('comparison.title')),
        h('div', { className: 'rr-muted' }, fill(t('comparison.summary'), {
          fixed: fixed.length, open: open.length, new: fresh.length,
        })),
        h('div', { className: 'rr-muted' }, fill(t('comparison.previous'), {
          sha: shortSha(asText(comparison.previous_head_sha, '')) || t('common.unknown'),
        })),
        fixed.length
          ? h('div', { className: 'rr-comparison-group' },
              h('div', { className: 'rr-list-label' }, t('comparison.fixedTitle')), renderItems(fixed))
          : null,
        open.length
          ? h('div', { className: 'rr-comparison-group' },
              h('div', { className: 'rr-list-label' }, t('comparison.openTitle')), renderItems(open))
          : null
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
      // 评论选择状态必须无条件初始化（组件有多个提前返回分支）。
      const [selected, setSelected] = React.useState({});
      const [commentMode, setCommentMode] = React.useState('issue');
      const [commentPreview, setCommentPreview] = React.useState(null);
      const [commentPosting, setCommentPosting] = React.useState(false);
      const [commentError, setCommentError] = React.useState('');
      const [commentResult, setCommentResult] = React.useState(null);
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

      // ---- 审查意见评论（多选 → 提交到 PR 对应代码处） ----
      const postedById = {};
      (Array.isArray(review.posted_comments) ? review.posted_comments : []).forEach(function (item) {
        if (isObject(item) && item.finding) postedById[String(item.finding)] = item;
      });
      const findingIds = findings.map(function (_, index) { return 'F' + (index + 1); });
      const selectedIds = findingIds.filter(function (id) { return Boolean(selected[id]) && !postedById[id]; });
      const commentable = Boolean(props.prNumber && props.projectId && props.commentEnabled !== false
        && kind === 'current');
      const canSelect = commentable && findings.length > 0;
      function toggleFinding(id) {
        setCommentError('');
        setCommentResult(null);
        setCommentPreview(null);
        setSelected(function (previous) {
          const next = Object.assign({}, previous);
          if (next[id]) delete next[id]; else next[id] = true;
          return next;
        });
      }
      async function submitComments(confirm) {
        if (!selectedIds.length || commentPosting) return;
        setCommentPosting(true);
        setCommentError('');
        try {
          const data = await postJSON(API_BASE + '/pulls/' + encodeURIComponent(String(props.prNumber)) + '/comments',
            { project: props.projectId, findings: selectedIds, mode: commentMode, confirm: confirm === true });
          if (!isObject(data) || (data.ok === false && !Array.isArray(data.items))) {
            throw new Error(asText(data && data.error, '') || t('comment.failed'));
          }
          if (confirm === true) {
            setCommentResult(data);
            setCommentPreview(null);
            setSelected({});
            if (props.onCommented) props.onCommented();
          } else {
            setCommentPreview(data);
          }
        } catch (error) {
          setCommentError(errorText(error));
        } finally {
          setCommentPosting(false);
        }
      }

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
              group.items.map(function (item) {
                const finding = item.finding;
                const findingId = 'F' + (item.index + 1);
                const posted = postedById[findingId];
                const title = asText(finding.title, t('finding.untitled'));
                const confidence = confidenceLabel(finding.confidence, t);
                const evidence = Array.isArray(finding.evidence)
                  ? finding.evidence
                  : (finding.evidence ? [finding.evidence] : []);
                const evidenceEntries = evidence.map(function (entry) {
                  const path = isObject(entry) ? asText(entry.path, '') : asText(entry, '');
                  const line = isObject(entry) && entry.line !== null && entry.line !== undefined ? String(entry.line) : '';
                  const reason = isObject(entry) ? asText(entry.reason, '') : '';
                  return { path: path, line: line, reason: reason };
                }).filter(function (entry) { return entry.path || entry.reason; });
                return h('article', {
                  key: findingId,
                  className: 'rr-finding rr-sev-' + group.severity + (posted ? ' rr-finding-posted' : ''),
                },
                  h('div', { className: 'rr-finding-head' },
                    canSelect && !posted
                      ? h('input', {
                          type: 'checkbox',
                          className: 'rr-finding-check',
                          checked: Boolean(selected[findingId]),
                          onChange: function () { toggleFinding(findingId); },
                          title: t('comment.select'),
                          'aria-label': t('comment.select') + ' ' + findingId,
                        })
                      : null,
                    h('div', { className: 'rr-finding-title' }, title),
                    h('div', { className: 'rr-finding-tags' },
                      h('span', { className: 'rr-badge rr-sev-badge' }, t('severity.' + group.severity)),
                      confidence ? h('span', { className: 'rr-badge' }, t('finding.confidence') + ' ' + confidence) : null,
                      posted
                        ? h('span', { className: 'rr-badge rr-posted-badge' },
                            t('comment.postedBadge') + ' · ' + (posted.inline ? t('comment.inline') : t('comment.general')))
                        : null
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
        canSelect ? h('div', { className: 'rr-comment-box' },
          h('div', { className: 'rr-comment-bar' },
            h('span', { className: 'rr-comment-count' }, fill(t('comment.selected'), { n: selectedIds.length })),
            h('label', { className: 'rr-comment-mode' },
              h('span', { className: 'rr-muted' }, t('comment.mode')),
              h('select', {
                value: commentMode,
                onChange: function (event) { setCommentMode(event.target.value); setCommentPreview(null); },
              },
                h('option', { value: 'issue' }, t('comment.mode.issue')),
                h('option', { value: 'suggestion' }, t('comment.mode.suggestion')),
                h('option', { value: 'question' }, t('comment.mode.question'))
              )
            ),
            h('button', {
              type: 'button',
              className: 'rr-btn rr-btn-primary rr-btn-sm',
              disabled: !selectedIds.length || commentPosting,
              onClick: function () { submitComments(false); },
            }, commentPosting ? t('comment.posting') : t('comment.submit')),
            h('span', { className: 'rr-muted rr-comment-hint' }, t('comment.hint'))
          ),
          commentError ? h('div', { className: 'rr-errorbox rr-errorbox-sm', role: 'alert' },
            h('div', { className: 'rr-errorbox-text' }, commentError)) : null,
          commentPreview ? h('div', { className: 'rr-comment-preview' },
            h('div', { className: 'rr-comment-preview-head' },
              h('span', { className: 'rr-list-label' }, t('comment.previewTitle')),
              h('span', { className: 'rr-muted' },
                fill(t('comment.previewHint'), { n: (Array.isArray(commentPreview.items) ? commentPreview.items : []).length }))
            ),
            (Array.isArray(commentPreview.items) ? commentPreview.items : []).map(function (item, index) {
              return h('div', { key: index, className: 'rr-comment-preview-item' },
                h('div', { className: 'rr-comment-preview-meta' },
                  h('span', { className: 'rr-badge' }, String(item.finding || '')),
                  h('code', { className: 'rr-evidence-path' },
                    asText(item.path, '') + (item.line ? ':' + String(item.line) : '')),
                  h('span', { className: 'rr-badge' }, item.inline ? t('comment.inline') : t('comment.general'))
                ),
                h('pre', { className: 'rr-comment-body' }, asText(item.body, ''))
              );
            }),
            h('div', { className: 'rr-comment-preview-actions' },
              h('button', {
                type: 'button', className: 'rr-btn rr-btn-primary rr-btn-sm', disabled: commentPosting,
                onClick: function () { submitComments(true); },
              }, commentPosting ? t('comment.posting') : t('comment.confirm')),
              h('button', {
                type: 'button', className: 'rr-btn rr-btn-sm', disabled: commentPosting,
                onClick: function () { setCommentPreview(null); },
              }, t('comment.cancel'))
            )
          ) : null,
          commentResult ? h('div', { className: 'rr-comment-result', role: 'status' },
            h('div', { className: 'rr-status-title' }, t('comment.resultTitle')),
            h('div', { className: 'rr-muted' }, fill(t('comment.resultSummary'),
              { posted: numberOr(commentResult.posted, 0), failed: numberOr(commentResult.failed, 0) }))) : null
        ) : null,
        h(ComparisonBlock, { comparison: review && review.comparison, t: t }),
        h(BulletBlock, { title: t('lists.affectedFlows'), items: asLines(review.affected_flows) }),
        h(BulletBlock, { title: t('lists.risksToVerify'), items: asLines(review.risks_to_verify) }),
        h(BulletBlock, { title: t('lists.coverageGaps'), items: asLines(review.coverage_gaps) }),
        h(BulletBlock, { title: t('lists.verificationPlan'), items: asLines(review.verification_plan) })
      );
    }

    function ReviewActions(props) {
      const t = props.t;
      const job = isObject(props.job) ? props.job : null;
      const kind = asText(props.kind, 'none');
      const running = Boolean(job && job.status === 'running');
      const failed = Boolean(job && job.status === 'error');
      const progress = job && Array.isArray(job.progress) ? job.progress.slice(-8) : [];
      const needsReview = kind === 'none' || kind === 'stale' || kind === 'failed';
      if (!running && !failed && !needsReview) return null;
      const label = running
        ? t('review.running')
        : (kind === 'stale' ? t('review.reviewAgain') : (kind === 'failed' ? t('review.retry') : t('review.start')));
      const trigger = function (reviewMode) {
        if (running || props.disabled === true || !props.onReview) return;
        props.onReview(reviewMode);
      };
      return h('div', { className: 'rr-review-actions' },
        h('div', { className: 'rr-review-actions-row' },
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-primary rr-btn-sm',
            onClick: function () { trigger('auto'); },
            disabled: running || props.disabled === true,
            title: props.disabledReason || '',
          }, running ? t('review.running') : label),
          running
            ? null
            : h('button', {
                type: 'button',
                className: 'rr-btn rr-btn-sm',
                onClick: function () { trigger('deep'); },
                disabled: props.disabled === true,
                title: t('review.deepHint'),
              }, t('review.deep')),
          h('span', { className: 'rr-muted', style: { fontSize: '11px' } },
            running ? t('review.runningHint') : t('review.startHint'))
        ),
        failed
          ? h('div', { className: 'rr-errorbox rr-errorbox-sm', role: 'alert' },
            h('div', { className: 'rr-errorbox-text' }, asText(job.error, t('review.failedHint'))))
          : null,
        running && progress.length
          ? h('div', { className: 'rr-knowledge-progress rr-review-progress' },
            progress.map(function (line, index) {
              return h('div', { key: index, className: 'rr-knowledge-progress-line' }, line);
            }))
          : null
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

    async function postJSON(path, body) {
      let response;
      try {
        response = await fetch(path, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
      } catch (error) {
        throw new Error(errorText(error) || 'Network error');
      }
      let data = null;
      try {
        data = await response.json();
      } catch (ignored) {
        data = null;
      }
      if (data && isObject(data) && data.ok === false) {
        throw new Error(asText(data.error, '') || ('HTTP ' + response.status));
      }
      if (!response.ok) {
        throw new Error(asText(data && data.error, '') || ('HTTP ' + response.status));
      }
      return data;
    }

    function knowledgeStatusKind(knowledge) {
      if (!isObject(knowledge)) return 'missing';
      const value = asText(knowledge.freshness, '');
      if (value === 'current' || value === 'stale' || value === 'missing') return value;
      return 'missing';
    }

    function knowledgeStatusLabel(kind, t) {
      if (kind === 'current') return t('knowledge.status.current');
      if (kind === 'stale') return t('knowledge.status.stale');
      return t('knowledge.status.missing');
    }

    function snapshotLabel(snapshot, t) {
      if (!isObject(snapshot)) return null;
      const mode = asText(snapshot.mode, '');
      const label = mode === 'semantic' ? t('knowledge.semantic') : t('knowledge.structural');
      return {
        label: label,
        sha: shortSha(snapshot.commit),
        created: snapshot.created_at ? formatDate(snapshot.created_at) : '',
        domains: Array.isArray(snapshot.refreshed_domains) ? snapshot.refreshed_domains.length : 0,
      };
    }

    function ProjectsView(props) {
      const t = props.t;
      if (props.loading && !props.projects.length) {
        return h('div', { className: 'rr-landing' },
          h('div', { className: 'rr-landing-head' },
            h('h2', { className: 'rr-landing-title' }, t('view.projects')),
            h('button', { type: 'button', className: 'rr-btn rr-btn-primary', disabled: true }, t('projects.loading'))
          ),
          h('div', { className: 'rr-landing-grid' },
            [0, 1, 2].map(function (index) { return h(ProjectSkeleton, { key: index }); }))
        );
      }
      if (props.error) {
        return h('div', { className: 'rr-landing' },
          h('div', { className: 'rr-landing-head' },
            h('h2', { className: 'rr-landing-title' }, t('view.projects'))
          ),
          h('div', { className: 'rr-state-card' },
            h(EmptyState, {
              icon: AlertIcon({ size: 24 }),
              title: t('projects.errorTitle'),
              hint: props.error || t('projects.errorHint'),
              action: h('button', { type: 'button', className: 'rr-btn rr-btn-sm', onClick: props.onRetry }, t('action.retry')),
            }))
        );
      }
      return h('div', { className: 'rr-landing' },
        h('div', { className: 'rr-landing-head' },
          h('div', null,
            h('h2', { className: 'rr-landing-title' }, t('view.projects')),
            h('div', { className: 'rr-landing-sub' }, t('projects.emptyHint'))
          ),
          h('button', { type: 'button', className: 'rr-btn rr-btn-primary', onClick: props.onImport }, t('action.import'))
        ),
        props.projects.length === 0
          ? h('div', { className: 'rr-state-card' },
            h(EmptyState, {
              icon: NavIcon({ size: 26 }),
              title: t('projects.empty'),
              hint: t('projects.emptyHint'),
              action: h('button', { type: 'button', className: 'rr-btn rr-btn-primary', onClick: props.onImport },
                t('action.import')),
            }))
          : h('div', { className: 'rr-landing-grid', role: 'list', 'aria-label': t('aria.projects') },
            props.projects.map(function (project) {
              return h(ProjectCard, {
                key: project.id,
                project: project,
                active: project.id === props.activeId,
                t: t,
                onOpen: props.onOpen,
              });
            }))
      );
    }

    function ProjectSkeleton() {
      return h('div', { className: 'rr-project-card rr-skeleton-card' },
        h('div', { className: 'rr-skeleton-line rr-skeleton-w60' }),
        h('div', { className: 'rr-skeleton-line rr-skeleton-w80' }),
        h('div', { className: 'rr-skeleton-line rr-skeleton-w40' }));
    }

    function ProjectCard(props) {
      const t = props.t;
      const project = isObject(props.project) ? props.project : {};
      const branches = Array.isArray(project.branches) ? project.branches : [];
      const snapshots = isObject(project.snapshots) ? project.snapshots : {};
      const shown = branches.slice(0, 4);
      const extra = branches.length - shown.length;
      const branchLines = shown.map(function (ref) {
        const entry = isObject(snapshots[ref]) ? snapshots[ref] : {};
        const snapshot = entry.semantic || entry.structural;
        const info = snapshotLabel(snapshot, t);
        return h('div', { key: ref, className: 'rr-branch-line' },
          h('code', { className: 'rr-branch-name' }, ref),
          h('span', { className: 'rr-muted' }, info
            ? (info.label + ' ' + info.sha)
            : t('knowledge.none'))
        );
      });
      const repoUrl = safeHttpUrl(project.repo_url);
      const repoStatePath = asText(project.repo_state, '');
      return h('div', {
        className: 'rr-project-card' + (props.active ? ' is-active' : '') + (project.error ? ' has-error' : ''),
        role: 'listitem',
      },
        h('div', { className: 'rr-project-card-head' },
          h('div', { className: 'rr-project-name' }, asText(project.name, asText(project.id, ''))),
          props.active ? h('span', { className: 'rr-tag rr-tag-brand' }, t('project.active')) : null
        ),
        repoUrl
          ? h('a', { className: 'rr-project-repo', href: repoUrl, target: '_blank', rel: 'noreferrer', title: project.repo_url },
            asText(project.repo_url, ''))
          : h('div', { className: 'rr-project-repo' }, asText(project.repo_url, t('common.unknown'))),
        repoStatePath
          ? h('div', {
            className: 'rr-project-path',
            title: t('project.copyPath') + ': ' + repoStatePath,
            onClick: function () { copyText(repoStatePath, t); },
          }, repoStatePath)
          : null,
        project.error
          ? h('div', { className: 'rr-project-error' }, project.error)
          : h('div', { className: 'rr-branch-lines' }, branchLines),
        h('div', { className: 'rr-project-card-foot' },
          h('span', { className: 'rr-muted' }, fill(t('projects.branchCount'), { n: branches.length })),
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm' + (props.active ? '' : ' rr-btn-primary'),
            onClick: function () { props.onOpen(project.id); },
            disabled: Boolean(project.error),
          }, t('action.open'))
        )
      );
    }

    function BranchSelect(props) {
      const t = props.t;
      const branches = Array.isArray(props.branches) ? props.branches : [];
      const value = asText(props.value, '');
      const options = branches.length
        ? branches
        : (value ? [value] : []);
      return h('label', { className: 'rr-branch-select', title: t('aria.branch') },
        h('span', { className: 'rr-branch-select-icon' }, h('svg', {
          viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': 'true',
        },
          h('circle', { cx: 4.5, cy: 4, r: 1.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
          h('circle', { cx: 4.5, cy: 12, r: 1.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
          h('circle', { cx: 11.5, cy: 8, r: 1.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
          h('path', { d: 'M4.5 5.8v4.4M6.3 4.6c2 0 3.4.6 3.4 3.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 })
        )),
        h('span', { className: 'rr-visually-hidden' }, t('branch.label')),
        h('select', {
          className: 'rr-select',
          value: value,
          'aria-label': t('aria.branch'),
          onChange: function (event) {
            if (props.onChange) props.onChange(event && event.target ? event.target.value : '');
          },
        }, options.map(function (branch) {
          const name = typeof branch === 'string' ? branch : asText(branch.name, '');
          const configured = typeof branch === 'string' ? true : branch.configured !== false;
          return h('option', { key: name, value: name }, configured ? name : name + '（未配置）');
        }))
      );
    }

    function KnowledgeCard(props) {
      const t = props.t;
      const knowledge = isObject(props.knowledge) ? props.knowledge : null;
      const kind = knowledgeStatusKind(knowledge);
      const snapshot = isObject(knowledge) && isObject(knowledge.snapshot) ? knowledge.snapshot : {};
      const best = snapshot.semantic || snapshot.structural;
      const info = snapshotLabel(best, t);
      const remote = isObject(knowledge) && isObject(knowledge.remote) ? knowledge.remote : {};
      const remoteSha = shortSha(remote.tip);
      const behind = numberOr(knowledge && knowledge.behind, 0);
      const ready = Boolean(knowledge && knowledge.semantic_ready === true);
      const reason = asText(knowledge && knowledge.semantic_reason, '');
      const paths = isObject(knowledge) && isObject(knowledge.paths) ? knowledge.paths : {};
      const pathRows = [
        { label: t('knowledge.pathSnapshot'), value: asText(paths.snapshot || paths.snapshots, '') },
        { label: t('knowledge.pathMirror'), value: asText(paths.mirror, '') },
      ].filter(function (row) { return Boolean(row.value); });
      const running = Boolean(props.job && props.job.status === 'running');
      const job = isObject(props.job) ? props.job : null;
      const allProgress = job && Array.isArray(job.progress) ? job.progress : [];
      const logsOpen = props.logsOpen !== false;
      const progress = logsOpen ? allProgress.slice(-8) : [];
      const disabled = props.loading || running;
      const mode = info ? info.label : '';
      return h('section', { className: 'rr-knowledge', 'aria-label': t('aria.knowledge') },
        h('div', { className: 'rr-knowledge-main' },
          h('div', { className: 'rr-knowledge-title' },
            h('span', { className: 'rr-knowledge-label' }, t('knowledge.title')),
            h('span', { className: 'rr-knowledge-badge is-' + kind },
              running ? t('knowledge.running') : knowledgeStatusLabel(kind, t)),
            info ? h('span', { className: 'rr-tag' }, mode + ' · ' + info.sha) : null,
            behind > 0 ? h('span', { className: 'rr-tag rr-tag-warn' }, fill(t('knowledge.behind'), { n: behind })) : null
          ),
          h('div', { className: 'rr-knowledge-meta' },
            h('span', null, t('knowledge.remote') + '：' + (remoteSha || t('common.none'))),
            h('span', null, t('knowledge.snapshot') + '：' + (info ? info.sha + ' · ' + info.created : t('knowledge.none'))),
            h('span', null, fill(t('knowledge.domains'), {
              n: knowledge && isObject(knowledge.config) && Array.isArray(knowledge.config.domains)
                ? knowledge.config.domains.length
                : 0,
            })),
            h('span', { className: 'rr-knowledge-hint' },
              kind === 'current' ? t('knowledge.currentHint')
                : kind === 'stale' ? t('knowledge.staleHint')
                  : t('knowledge.missingHint'))
          ),
          pathRows.length
            ? h('div', { className: 'rr-knowledge-paths' },
              pathRows.map(function (row) {
                return h('div', {
                  key: row.label,
                  className: 'rr-knowledge-path',
                  title: t('knowledge.copyPath') + ': ' + row.value,
                  onClick: function () { copyText(row.value, t); },
                },
                  h('span', { className: 'rr-knowledge-path-label' }, row.label),
                  h('code', null, row.value));
              }))
            : null,
          !ready && kind !== 'current'
            ? h('div', { className: 'rr-knowledge-note' },
              fill(t('knowledge.semanticDisabled'), { reason: reason || t('health.unknown') }))
            : null,
          progress.length
            ? h('div', { className: 'rr-knowledge-progress' },
              h('div', { className: 'rr-knowledge-progress-head' },
                h('span', { className: 'rr-knowledge-progress-label' }, t('knowledge.progress')),
                h('button', {
                  type: 'button',
                  className: 'rr-log-close',
                  onClick: function () { if (props.onToggleLogs) props.onToggleLogs(false); },
                  'aria-label': t('knowledge.hideLogs'),
                  title: t('knowledge.hideLogs'),
                }, '×')
              ),
              progress.map(function (line, index) {
                return h('div', { key: index, className: 'rr-knowledge-progress-line' }, line);
              }))
            : (allProgress.length
              ? h('button', {
                type: 'button',
                className: 'rr-log-toggle',
                onClick: function () { if (props.onToggleLogs) props.onToggleLogs(true); },
              }, t('knowledge.showLogs'))
              : null)
        ),
        h('div', { className: 'rr-knowledge-actions' },
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm',
            onClick: props.onCheck,
            disabled: disabled,
            title: t('action.check'),
          }, t('action.check')),
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm',
            onClick: function () { props.onSync('structural'); },
            disabled: disabled,
            title: t('knowledge.syncStructural'),
          }, t('knowledge.syncStructural')),
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm rr-btn-primary',
            onClick: function () { props.onSync('semantic'); },
            disabled: disabled || !ready,
            title: ready ? t('knowledge.syncSemantic') : fill(t('knowledge.semanticDisabled'), { reason: reason || t('health.unknown') }),
          }, t('knowledge.syncSemantic')),
          props.notice ? h('div', { className: 'rr-knowledge-notice' }, props.notice) : null
        )
      );
    }

    function ImportDialog(props) {
      const t = props.t;
      const [url, setUrl] = React.useState('');
      const [name, setName] = React.useState('');
      const [local, setLocal] = React.useState('');
      const [branches, setBranches] = React.useState([]);
      const [selected, setSelected] = React.useState([]);
      const [probing, setProbing] = React.useState(false);
      const [importing, setImporting] = React.useState(false);
      const [error, setError] = React.useState('');
      const urlRef = React.useRef(null);

      React.useEffect(function () {
        if (urlRef.current && urlRef.current.focus) urlRef.current.focus();
        function onKey(event) {
          if (event && event.key === 'Escape' && props.onClose) props.onClose();
        }
        window.addEventListener('keydown', onKey);
        return function () { window.removeEventListener('keydown', onKey); };
      }, []);

      const urlValid = /^https:\/\/[^\s]+$/i.test(url.trim());

      async function runProbe() {
        if (!urlValid) {
          setError(t('import.urlInvalid'));
          return;
        }
        setProbing(true);
        setError('');
        try {
          let path = API_BASE + '/projects/probe?url=' + encodeURIComponent(url.trim());
          if (local.trim()) path += '&local=' + encodeURIComponent(local.trim());
          const data = await fetchJSON(path, undefined);
          if (!isObject(data) || data.ok === false) throw new Error(asText(data && data.error, '') || 'probe failed');
          const probeValue = isObject(data.probe) ? data.probe : data;
          const list = Array.isArray(probeValue.branches) ? probeValue.branches : [];
          setBranches(list);
          const defaults = list.filter(function (branch) { return branch.default; }).map(function (branch) { return branch.name; });
          setSelected(defaults.length ? defaults : (list.length ? [list[0].name] : []));
          if (!name.trim() && probeValue.name_suggestion) setName(asText(probeValue.name_suggestion, ''));
        } catch (probeError) {
          setError(errorText(probeError));
        } finally {
          setProbing(false);
        }
      }

      async function submit() {
        if (!urlValid) {
          setError(t('import.urlInvalid'));
          return;
        }
        if (branches.length && selected.length === 0) {
          setError(t('import.branchRequired'));
          return;
        }
        setImporting(true);
        setError('');
        try {
          const data = await postJSON(API_BASE + '/projects/import', {
            url: url.trim(),
            name: name.trim() || undefined,
            local: local.trim() || undefined,
            branches: selected,
          });
          if (!isObject(data) || data.ok === false) throw new Error(asText(data && data.error, '') || 'import failed');
          if (props.onImported) props.onImported(data);
        } catch (importError) {
          setError(errorText(importError));
        } finally {
          setImporting(false);
        }
      }

      function toggleBranch(branchName) {
        setSelected(function (previous) {
          if (previous.indexOf(branchName) >= 0) {
            return previous.filter(function (item) { return item !== branchName; });
          }
          return previous.concat([branchName]);
        });
      }

      return h('div', {
        className: 'rr-modal-backdrop',
        onMouseDown: function (event) {
          if (event && event.target === event.currentTarget && props.onClose) props.onClose();
        },
      },
        h('div', { className: 'rr-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('aria.import') },
          h('div', { className: 'rr-modal-head' },
            h('h2', { className: 'rr-modal-title' }, t('import.title')),
            h('button', {
              type: 'button', className: 'rr-icon-btn', onClick: props.onClose,
              'aria-label': t('aria.close'), title: t('aria.close'),
            }, '×')
          ),
          h('div', { className: 'rr-modal-body' },
            h('label', { className: 'rr-field' },
              h('span', { className: 'rr-field-label' }, t('import.url')),
              h('input', {
                ref: urlRef,
                className: 'rr-input',
                type: 'url',
                value: url,
                placeholder: 'https://gitcode.com/owner/repo',
                onChange: function (event) { setUrl(event && event.target ? event.target.value : ''); setBranches([]); },
              }),
              h('span', { className: 'rr-field-hint' }, t('import.urlHint'))
            ),
            h('label', { className: 'rr-field' },
              h('span', { className: 'rr-field-label' }, t('import.name')),
              h('input', {
                className: 'rr-input',
                value: name,
                placeholder: t('import.nameHint'),
                onChange: function (event) { setName(event && event.target ? event.target.value : ''); },
              })
            ),
            h('label', { className: 'rr-field' },
              h('span', { className: 'rr-field-label' }, t('import.local')),
              h('input', {
                className: 'rr-input',
                value: local,
                placeholder: 'D:\\path\\to\\clone',
                onChange: function (event) { setLocal(event && event.target ? event.target.value : ''); },
              }),
              h('span', { className: 'rr-field-hint' }, t('import.localHint'))
            ),
            h('div', { className: 'rr-field' },
              h('div', { className: 'rr-field-row' },
                h('span', { className: 'rr-field-label' }, t('import.branches')),
                h('button', {
                  type: 'button', className: 'rr-btn rr-btn-sm', onClick: runProbe,
                  disabled: probing || !urlValid,
                }, probing ? t('import.probing') : t('import.probe'))
              ),
              branches.length
                ? h('div', { className: 'rr-branch-picker' }, branches.map(function (branch) {
                  const checked = selected.indexOf(branch.name) >= 0;
                  return h('button', {
                    key: branch.name,
                    type: 'button',
                    className: 'rr-chip' + (checked ? ' is-on' : ''),
                    'aria-pressed': checked ? 'true' : 'false',
                    onClick: function () { toggleBranch(branch.name); },
                  }, branch.name);
                }))
                : h('span', { className: 'rr-field-hint' }, t('import.probeFirst'))
            ),
            error ? h('div', { className: 'rr-form-error', role: 'alert' }, error) : null
          ),
          h('div', { className: 'rr-modal-foot' },
            h('button', {
              type: 'button', className: 'rr-btn', onClick: props.onClose, disabled: importing,
            }, t('action.cancel')),
            h('button', {
              type: 'button', className: 'rr-btn rr-btn-primary', onClick: submit,
              disabled: importing || !urlValid,
            }, importing ? t('import.importing') : t('import.submit'))
          )
        )
      );
    }

    function ModelSettings(props) {
      const t = props.t;
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [providers, setProviders] = React.useState([]);
      const [harnessCurrent, setHarnessCurrent] = React.useState(null);
      const [provider, setProvider] = React.useState('');
      const [model, setModel] = React.useState('');
      const [apiKey, setApiKey] = React.useState('');
      const [saving, setSaving] = React.useState(false);
      const [result, setResult] = React.useState(null);

      React.useEffect(function () {
        let active = true;
        const controller = new AbortController();
        (async function () {
          setLoading(true);
          setError('');
          try {
            const values = await Promise.all([
              fetchJSON(API_BASE + '/harness-models', controller.signal).catch(function () { return null; }),
              fetchJSON(API_BASE + '/model-config?project=' + encodeURIComponent(String(props.projectId || '')), controller.signal)
                .catch(function () { return null; }),
            ]);
            if (!active) return;
            const catalog = isObject(values[0]) && Array.isArray(values[0].providers) ? values[0].providers : [];
            setHarnessCurrent(isObject(values[0]) && isObject(values[0].current) ? values[0].current : null);
            const usable = catalog.filter(function (item) {
              return isObject(item) && item.base_url && Array.isArray(item.models) && item.models.length > 0;
            });
            const saved = isObject(values[1]) && isObject(values[1].model_backend) ? values[1].model_backend : {};
            const savedProvider = asText(saved.provider, '');
            const savedModel = asText(saved.model, '');
            const matched = usable.filter(function (item) { return item.id === savedProvider; })[0] || null;
            const chosen = matched || usable[0] || null;
            setProviders(usable);
            setProvider(chosen ? chosen.id : savedProvider);
            setModel(savedModel || (chosen && chosen.models.length ? asText(chosen.models[0].id, '') : ''));
            if (isObject(values[1])) setResult(values[1]);
          } catch (loadError) {
            if (!active || controller.signal.aborted) return;
            setError(errorText(loadError));
          } finally {
            if (active) setLoading(false);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [props.projectId]);

      const current = providers.filter(function (item) { return item.id === provider; })[0] || null;
      const models = current && Array.isArray(current.models) ? current.models : [];
      const ready = Boolean(result && result.ready === true);
      const checks = result && isObject(result.checks) ? result.checks : {};
      const errors = result && isObject(result.errors) ? result.errors : {};
      const destination = result && isObject(result.destination) ? result.destination : {};
      const credential = isObject(destination.credential) ? destination.credential : {};
      const test = result && isObject(result.test) ? result.test : null;
      const firstError = Object.keys(errors).length ? asText(errors[Object.keys(errors)[0]], '') : '';

      function chooseProvider(nextProvider) {
        setProvider(nextProvider);
        const found = providers.filter(function (item) { return item.id === nextProvider; })[0];
        if (found && Array.isArray(found.models) && found.models.length) setModel(asText(found.models[0].id, ''));
      }

      async function useHarnessModel() {
        setSaving(true);
        setError('');
        try {
          const data = await postJSON(API_BASE + '/model-config/use-harness', { project: props.projectId });
          if (isObject(data) && data.ok === false) throw new Error(asText(data.error, ''));
          const controller = isObject(data) && isObject(data.controller) ? data.controller : null;
          const merged = {
            ...((await fetchJSON(API_BASE + '/model-config?project=' + encodeURIComponent(String(props.projectId || '')), undefined).catch(function () { return null; })) || {}),
            test: controller && isObject(controller.test) ? controller.test : null,
          };
          setResult(merged);
          if (controller && isObject(controller.selection)) setHarnessCurrent(controller.selection);
        } catch (useError) {
          setError(errorText(useError));
        } finally {
          setSaving(false);
        }
      }

      async function apply() {
        if (!provider || !model) {
          setResult(function (previous) {
            return { ...(isObject(previous) ? previous : {}), error: t('settings.needModel') };
          });
          return;
        }
        if (!apiKey.trim()) {
          // 手动路径指向外部网关：必须提供该网关的 Key，否则会沿用桥令牌而收到 401。
          setResult(function (previous) {
            return { ...(isObject(previous) ? previous : {}), error: t('settings.needKeyForManual') };
          });
          return;
        }
        setSaving(true);
        setError('');
        try {
          const data = await postJSON(API_BASE + '/model-config/apply', {
            project: props.projectId,
            provider: provider,
            model: model,
            base_url: current && current.base_url ? current.base_url : undefined,
            credential_env: current && current.credential_env ? current.credential_env : undefined,
            api_key: apiKey.trim() || undefined,
          });
          if (isObject(data) && data.ok === false) throw new Error(asText(data.error, ''));
          if (isObject(data)) {
            const merged = {
              ...((await fetchJSON(API_BASE + '/model-config?project=' + encodeURIComponent(String(props.projectId || '')), undefined).catch(function () { return null; })) || {}),
              test: isObject(data.test) ? data.test : null,
            };
            setResult(merged);
          }
          setApiKey('');
        } catch (applyError) {
          setError(errorText(applyError));
        } finally {
          setSaving(false);
        }
      }

      return h('div', { className: 'rr-settings' },
        h('div', { className: 'rr-settings-head' },
          h('div', null,
            h('h2', { className: 'rr-settings-title' }, t('settings.title')),
            h('div', { className: 'rr-settings-sub' }, t('settings.sub'))
          ),
          h('button', { type: 'button', className: 'rr-btn rr-btn-sm', onClick: props.onBack }, t('settings.back'))
        ),
        loading
          ? h('div', { className: 'rr-state-card' }, h(EmptyState, {
            icon: NavIcon({ size: 22 }), title: t('settings.loading'), hint: '',
          }))
          : error
            ? h('div', { className: 'rr-state-card' }, h(EmptyState, {
              icon: AlertIcon({ size: 22 }), title: t('settings.errorTitle'), hint: error,
            }))
            : h('div', { className: 'rr-settings-card' },
              h('div', { className: 'rr-settings-row' },
                h('span', { className: 'rr-settings-label' }, t('settings.currentModel')),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  h('span', { className: 'rr-muted', style: { fontSize: '11.5px' } },
                    harnessCurrent
                      ? (asText(harnessCurrent.provider, '') + ' :: ' + asText(harnessCurrent.model, ''))
                      : t('settings.harnessUnavailable')),
                  h('button', {
                    type: 'button', className: 'rr-btn rr-btn-primary rr-btn-sm',
                    onClick: useHarnessModel, disabled: saving,
                  }, saving ? t('settings.saving') : t('settings.useHarness')),
                  h('span', { className: 'rr-field-hint' }, t('settings.useHarnessHint'))
                )
              ),
              h('div', { className: 'rr-settings-divider' }, t('settings.orManual')),
              providers.length === 0
                ? h('div', { className: 'rr-form-error' }, t('settings.noProvider'))
                : null,
              h('label', { className: 'rr-settings-row' },
                h('span', { className: 'rr-settings-label' }, t('settings.harnessProvider')),
                h('select', {
                  className: 'rr-select',
                  value: provider,
                  onChange: function (event) { chooseProvider(event && event.target ? event.target.value : ''); },
                }, providers.map(function (item) {
                  return h('option', { key: item.id, value: item.id }, item.name + '（' + item.id + '）');
                }))
              ),
              h('label', { className: 'rr-settings-row' },
                h('span', { className: 'rr-settings-label' }, t('settings.harnessModel')),
                h('select', {
                  className: 'rr-select',
                  value: model,
                  onChange: function (event) { setModel(event && event.target ? event.target.value : ''); },
                }, models.map(function (item) {
                  return h('option', { key: item.id, value: item.id }, item.name + '（' + item.id + '）');
                }))
              ),
              h('label', { className: 'rr-settings-row' },
                h('span', { className: 'rr-settings-label' }, t('settings.apiKey')),
                h('input', {
                  className: 'rr-input',
                  type: 'password',
                  autoComplete: 'off',
                  value: apiKey,
                  placeholder: credential.present ? t('settings.keyAlready') : 'sk-...',
                  onChange: function (event) { setApiKey(event && event.target ? event.target.value : ''); },
                })
              ),
              h('div', { className: 'rr-settings-status' },
                h('span', null,
                  h('span', { className: 'rr-badge ' + (ready ? 'is-ok' : 'is-warn') },
                    ready ? t('settings.ready') : t('settings.notReady')),
                  credential.present ? h('span', { className: 'rr-muted', style: { marginLeft: '8px' } },
                    t('settings.credential') + '：' + t('settings.present')) : null),
                firstError ? h('span', { className: 'rr-form-error' }, firstError) : null,
                test
                  ? h('span', { className: test.ok ? 'is-ok' : 'is-warn' },
                    test.skipped
                      ? t('settings.testSkipped') + '：' + asText(test.reason, '')
                      : (test.ok
                        ? fill(t('settings.testOk'), { n: numberOr(test.model_count, 0), ms: numberOr(test.duration_ms, 0) })
                        : t('settings.testFailed') + '：' + asText(test.error || ('HTTP ' + numberOr(test.status, 0)), '')))
                  : null
              ),
              h('div', { className: 'rr-settings-foot' },
                h('button', {
                  type: 'button', className: 'rr-btn rr-btn-primary', onClick: apply, disabled: saving,
                }, saving ? t('settings.saving') : t('settings.apply')),
                h('button', {
                  type: 'button', className: 'rr-btn rr-btn-sm',
                  onClick: async function () {
                    try {
                      const data = await postJSON(API_BASE + '/model-config/test', { project: props.projectId });
                      setResult(function (previous) {
                        return { ...(isObject(previous) ? previous : {}), test: isObject(data) ? data : null };
                      });
                    } catch (testError) {
                      setError(errorText(testError));
                    }
                  },
                  disabled: saving,
                }, t('settings.test'))
              )
            )
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
      const knowledgeMode = review ? asText(review.knowledge_mode, '') : '';
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
            knowledgeMode
              ? h('span', { className: 'rr-badge' },
                  knowledgeMode === 'fast' ? t('review.fastBadge') : t('review.deepBadge'))
              : null,
            findingsTotal > 0 ? h('span', { className: 'rr-section-count' }, fill(t('review.findingsCount'), { n: findingsTotal })) : null
          ),
          h(ReviewBody, {
            review: review,
            job: job,
            t: t,
            prNumber: pr.number,
            projectId: props.projectId,
            onCommented: props.onCommented,
          }),
          h(ReviewActions, {
            kind: kind,
            job: props.reviewJob || null,
            onReview: props.onReview,
            disabled: props.reviewDisabled === true,
            disabledReason: props.reviewDisabledReason,
            t: t,
          })
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
      // ---- 项目与知识库状态 ----
      const [projects, setProjects] = React.useState([]);
      const [projectsLoading, setProjectsLoading] = React.useState(true);
      const [projectsError, setProjectsError] = React.useState('');
      const [projectsReload, setProjectsReload] = React.useState(0);
      const [projectId, setProjectId] = React.useState(null);
      const [view, setView] = React.useState('landing');
      const [importOpen, setImportOpen] = React.useState(false);
      const [importNotice, setImportNotice] = React.useState('');
      const [branches, setBranches] = React.useState([]);
      const [branch, setBranch] = React.useState('');
      const [knowledge, setKnowledge] = React.useState(null);
      const [knowledgeLoading, setKnowledgeLoading] = React.useState(false);
      const [knowledgeError, setKnowledgeError] = React.useState('');
      const [knowledgeTick, setKnowledgeTick] = React.useState(0);
      const [knowledgeNotice, setKnowledgeNotice] = React.useState('');
      const [syncJob, setSyncJob] = React.useState(null);
      const [reviewJob, setReviewJob] = React.useState(null);
      const [logsOpen, setLogsOpen] = React.useState(true);
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      // ---- PR 列表与详情状态 ----
      const [listData, setListData] = React.useState(null);
      const [listLoading, setListLoading] = React.useState(true);
      const [listError, setListError] = React.useState('');
      // 每次进入工作区都强制刷新到最新（列表请求带 refresh=1），不再提供手动刷新按钮。
      const [reloadKey, setReloadKey] = React.useState(1);
      const [selected, setSelected] = React.useState(null);
      const [detail, setDetail] = React.useState(null);
      const [detailLoading, setDetailLoading] = React.useState(false);
      const [detailError, setDetailError] = React.useState('');
      const [detailReloadKey, setDetailReloadKey] = React.useState(0);
      const [query, setQuery] = React.useState('');
      const [stateFilter, setStateFilter] = React.useState('all');
      const [listPane, setListPane] = React.useState('list');
      const [health, setHealth] = React.useState(null);

      // 1) 项目列表：首屏决定落在项目总览还是工作区
      React.useEffect(function () {
        let active = true;
        const controller = new AbortController();
        setProjectsLoading(true);
        setProjectsError('');
        (async function () {
          try {
            const data = await fetchJSON(API_BASE + '/projects' + (projectsReload > 0 ? '?refresh=1' : ''), controller.signal);
            if (!active) return;
            if (!isObject(data)) throw new Error('Invalid response');
            const items = Array.isArray(data.projects) ? data.projects.filter(isObject) : [];
            setProjects(items);
            setProjectId(function (previous) {
              if (previous && items.some(function (item) { return item.id === previous; })) return previous;
              const fallback = asText(data.default_project, '');
              if (fallback && items.some(function (item) { return item.id === fallback; })) return fallback;
              return items.length === 1 ? items[0].id : previous;
            });
            setView(function (previous) {
              if (previous === 'workspace') return previous;
              const fallback = asText(data.default_project, '');
              return fallback ? 'workspace' : 'landing';
            });
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setProjectsError(errorText(error));
          } finally {
            if (active) setProjectsLoading(false);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [projectsReload]);

      const activeProject = React.useMemo(function () {
        for (let index = 0; index < projects.length; index += 1) {
          if (projects[index].id === projectId) return projects[index];
        }
        return null;
      }, [projects, projectId]);

      // 2) 分支列表：项目切换或知识库刷新后重新读取
      React.useEffect(function () {
        if (!projectId) {
          setBranches([]);
          setBranch('');
          return undefined;
        }
        let active = true;
        const controller = new AbortController();
        (async function () {
          try {
            const refresh = knowledgeTick > 0 ? '?refresh=1' : '';
            const data = await fetchJSON(API_BASE + '/projects/' + encodeURIComponent(projectId) + '/branches' + refresh, controller.signal);
            if (!active) return;
            const items = isObject(data) && Array.isArray(data.branches) ? data.branches.filter(isObject) : [];
            setBranches(items);
            setBranch(function (previous) {
              if (previous && items.some(function (item) { return item.name === previous; })) return previous;
              const project = (function () {
                for (let index = 0; index < projects.length; index += 1) {
                  if (projects[index].id === projectId) return projects[index];
                }
                return null;
              })();
              const configured = project && Array.isArray(project.branches) ? project.branches : [];
              if (configured.length && items.some(function (item) { return item.name === configured[0]; })) {
                return configured[0];
              }
              const fallback = items.filter(function (item) { return item.default; })[0];
              return fallback ? fallback.name : (items.length ? items[0].name : '');
            });
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setBranches([]);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [projectId, knowledgeTick]);

      // 3) 知识库状态
      React.useEffect(function () {
        if (!projectId || !branch) {
          setKnowledge(null);
          return undefined;
        }
        let active = true;
        const controller = new AbortController();
        setKnowledgeLoading(true);
        setKnowledgeError('');
        (async function () {
          try {
            const query = '?ref=' + encodeURIComponent(branch) + (knowledgeTick > 0 ? '&refresh=1' : '');
            const data = await fetchJSON(API_BASE + '/projects/' + encodeURIComponent(projectId) + '/knowledge' + query, controller.signal);
            if (!active) return;
            if (isObject(data) && data.error) {
              setKnowledge(null);
              setKnowledgeError(asText(data.error, ''));
              return;
            }
            setKnowledge(isObject(data) ? data : null);
          } catch (error) {
            if (!active || controller.signal.aborted) return;
            setKnowledgeError(errorText(error));
          } finally {
            if (active) setKnowledgeLoading(false);
          }
        })();
        return function () {
          active = false;
          controller.abort();
        };
      }, [projectId, branch, knowledgeTick]);

      // 4) PR 列表（按项目）
      React.useEffect(function () {
        if (!projectId) return undefined;
        let active = true;
        const controller = new AbortController();
        setListLoading(true);
        setListError('');
        (async function () {
          try {
            const params = ['project=' + encodeURIComponent(projectId)];
            if (reloadKey > 0) params.push('refresh=1');
            const data = await fetchJSON(API_BASE + '/pulls?' + params.join('&'), controller.signal);
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
      }, [reloadKey, projectId]);

      // 5) 控制器健康状态
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
      }, []);

      // 6) PR 详情
      React.useEffect(function () {
        if (selected === null || selected === undefined || !projectId) {
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
            const params = ['project=' + encodeURIComponent(projectId)];
            if (detailReloadKey > 0) params.push('refresh=1');
            const data = await fetchJSON(API_BASE + '/pulls/' + encodeURIComponent(String(selected)) + '?' + params.join('&'), controller.signal);
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
      }, [selected, detailReloadKey, projectId]);

      // 7) 知识库同步任务轮询
      React.useEffect(function () {
        if (!syncJob || syncJob.status !== 'running') return undefined;        let active = true;
        const timer = setInterval(function () {
          (async function () {
            try {
              const data = await fetchJSON(API_BASE + '/jobs/' + encodeURIComponent(syncJob.job_id), undefined);
              if (!active || !isObject(data)) return;
              setSyncJob(data);
              if (data.status === 'done') {
                const result = isObject(data.result) ? data.result : {};
                setKnowledgeNotice(fill(t('knowledge.synced'), { sha: shortSha(result.commit) || shortSha(result.snapshot_id) }));
                setKnowledgeTick(function (value) { return value + 1; });
                setProjectsReload(function (value) { return value + 1; });
                setLogsOpen(false);
              } else if (data.status === 'error') {
                setKnowledgeNotice(fill(t('knowledge.failed'), { message: asText(data.error, t('health.unknown')) }));
                setLogsOpen(false);
              }
            } catch (error) {
              if (active) setKnowledgeNotice(fill(t('knowledge.failed'), { message: errorText(error) }));
            }
          })();
        }, 1500);
        return function () {
          active = false;
          clearInterval(timer);
        };
      }, [syncJob]);

      // 8) PR 审查任务轮询（完成/失败后刷新详情与列表）
      React.useEffect(function () {
        const job = reviewJob && reviewJob.job;
        if (!job || job.status !== 'running' || !job.job_id) return undefined;
        let active = true;
        const timer = setInterval(function () {
          (async function () {
            try {
              const data = await fetchJSON(API_BASE + '/jobs/' + encodeURIComponent(job.job_id), undefined);
              if (!active || !isObject(data)) return;
              setReviewJob({ number: reviewJob.number, job: data });
              if (data.status === 'done') {
                setDetailReloadKey(function (value) { return value + 1; });
                setReloadKey(function (value) { return value + 1; });
              }
            } catch (error) {
              if (active) {
                setReviewJob({ number: reviewJob.number, job: { ...job, status: 'error', error: errorText(error) } });
              }
            }
          })();
        }, 2000);
        return function () {
          active = false;
          clearInterval(timer);
        };
      }, [reviewJob && reviewJob.job && reviewJob.job.job_id, reviewJob && reviewJob.job && reviewJob.job.status]);

      React.useEffect(function () {
        if (selected === null || selected === undefined) setListPane('list');
      }, [selected]);

      function openProject(id) {
        setProjectId(id);
        setView('workspace');
        setBranch('');
        setKnowledge(null);
        setKnowledgeNotice('');
        setImportNotice('');
        setSelected(null);
        setQuery('');
        setStateFilter('all');
        setReloadKey(function (value) { return value + 1; });
        setSettingsOpen(false);
      }

      function openImport() {
        setImportOpen(true);
      }

      function handleImported(result) {
        const project = isObject(result) && isObject(result.project) ? result.project : null;
        setImportOpen(false);
        setProjectsReload(function (value) { return value + 1; });
        if (project && project.id) {
          setImportNotice(result.created === false ? t('import.existing') : '');
          openProject(project.id);
        }
      }

      function checkKnowledge() {
        setKnowledgeNotice('');
        setKnowledgeTick(function (value) { return value + 1; });
        setProjectsReload(function (value) { return value + 1; });
      }

      async function startSync(mode) {
        if (!projectId || !branch) return;
        setKnowledgeNotice('');
        try {
          const data = await postJSON(API_BASE + '/projects/' + encodeURIComponent(projectId) + '/knowledge/sync', {
            ref: branch,
            mode: mode,
            fetch: true,
          });
          if (!isObject(data) || data.ok === false || !data.job_id) {
            throw new Error(asText(data && data.error, '') || 'sync failed');
          }
          setSyncJob({
            job_id: data.job_id,
            status: 'running',
            progress: [],
            result: null,
            error: null,
            mode: mode,
          });
          setLogsOpen(true);
        } catch (error) {
          setKnowledgeNotice(fill(t('knowledge.failed'), { message: errorText(error) }));
        }
      }

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
      const repoId = asText(repoObject.id, activeProject ? asText(activeProject.repo_url, t('common.unknown')) : t('common.unknown'));
      const generated = listData && listData.generated_at ? formatDate(listData.generated_at) : t('common.none');
      const activeFilters = normalizedQuery !== '' || stateFilter !== 'all';
      const modelChecks = health && isObject(health.checks) ? health.checks : {};
      const modelReady = ['model_provider', 'model_protocol', 'model_endpoint', 'model_name', 'model_credential']
        .every(function (key) { return modelChecks[key] === true; });
      const modelBlockReason = health && isObject(health.errors)
        ? asText(Object.values(health.errors)[0], '')
        : '';

      function refresh() {
        setReloadKey(function (value) { return value + 1; });
      }

      function retryDetail() {
        setDetailReloadKey(function (value) { return value + 1; });
      }

      function selectPr(number) {
        if (number === null || number === undefined) return;
        setSelected(number);
        setListPane('detail');
      }

      function clearFilters() {
        setQuery('');
        setStateFilter('all');
      }

      async function startReview(mode) {
        if (selected === null || selected === undefined || !projectId) return;
        const number = selected;
        try {
          const data = await postJSON(API_BASE + '/pulls/' + encodeURIComponent(String(number)) + '/review',
            { project: projectId, mode: mode === 'deep' ? 'deep' : 'auto' });
          if (!isObject(data) || data.ok === false || !data.job_id) {
            throw new Error(asText(data && data.error, '') || 'review failed');
          }
          setReviewJob({ number: number, job: { job_id: data.job_id, status: 'running', progress: [] } });
        } catch (reviewError) {
          setReviewJob({ number: number, job: { status: 'error', error: errorText(reviewError), progress: [] } });
        }
      }

      function goBack() {
        setListPane('list');
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
        detailContent = h(DetailView, {
          key: String(selected),
          detail: detail,
          t: t,
          projectId: projectId,
          onCommented: retryDetail,
          reviewJob: reviewJob && reviewJob.number === selected ? reviewJob.job : null,
          onReview: startReview,
          reviewDisabled: !modelReady,
          reviewDisabledReason: modelReady ? '' : (modelBlockReason || t('review.modelRequired')),
        });
      }

      const headerTitle = h('div', { className: 'rr-head-title' },
        h('span', { className: 'rr-logo' }, NavIcon({ size: 17 })),
        h('h1', { className: 'rr-title' }, t('title')),
        activeProject && view === 'workspace'
          ? h('span', { className: 'rr-repo', title: asText(activeProject.repo_url, '') }, asText(activeProject.name, ''))
          : h('span', { className: 'rr-repo' }, t('view.projects'))
      );

      const headerActions = view === 'landing'
        ? h('div', { className: 'rr-head-actions' },
          h('button', { type: 'button', className: 'rr-btn rr-btn-primary', onClick: openImport },
            t('action.import')))
        : h('div', { className: 'rr-head-actions' },
          branches.length
            ? h(BranchSelect, { branches: branches, value: branch, t: t, onChange: setBranch })
            : null,
          h('button', { type: 'button', className: 'rr-btn rr-btn-sm', onClick: function () { setView('landing'); } },
            t('action.backToProjects')),
          h('button', {
            type: 'button',
            className: 'rr-btn rr-btn-sm',
            onClick: function () { setSettingsOpen(function (value) { return !value; }); },
            'aria-pressed': settingsOpen ? 'true' : 'false',
          }, t('action.model'))
        );

      const metaLine = view === 'workspace'
        ? h('div', { className: 'rr-head-meta' },
          h('span', {
            className: 'rr-source' + (sourceLive ? ' is-live' : ''),
            title: sourceError || (t('source.label') + ': ' + sourceLabel),
          },
            h('span', { className: 'rr-source-dot' }),
            sourceLabel
          ),
          h('span', { className: 'rr-generated' }, t('header.generatedAt') + ' ' + generated)
        )
        : null;

      const body = settingsOpen && view === 'workspace'
        ? h(ModelSettings, {
          projectId: projectId,
          t: t,
          onBack: function () { setSettingsOpen(false); },
        })
        : view === 'landing'
          ? h(ProjectsView, {
            projects: projects,
            loading: projectsLoading,
            error: projectsError,
            activeId: projectId,
            t: t,
            onOpen: openProject,
            onImport: openImport,
            onRetry: function () { setProjectsReload(function (value) { return value + 1; }); },
          })
          : h('div', { className: 'rr-workspace' },
            h(KnowledgeCard, {
              knowledge: knowledge,
              job: syncJob,
              loading: knowledgeLoading,
              logsOpen: logsOpen,
              notice: knowledgeNotice || (knowledgeError ? fill(t('knowledge.failed'), { message: knowledgeError }) : ''),
              t: t,
              onCheck: checkKnowledge,
              onSync: startSync,
              onToggleLogs: setLogsOpen,
            }),
          importNotice ? h('div', { className: 'rr-notice' }, importNotice) : null,
          h('div', { className: 'rr-body', 'data-pane': listPane },
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

      return h('div', { className: 'rr-page', 'data-view': view, 'data-pane': listPane },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('header', { className: 'rr-head' },
          h('div', { className: 'rr-head-main' }, headerTitle, metaLine),
          headerActions
        ),
        body,
        importOpen ? h(ImportDialog, { t: t, onClose: function () { setImportOpen(false); }, onImported: handleImported }) : null
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // 内置 locale id 通常是 zh/en 裸标签，但浏览器或偏好可能给出 zh-CN/zh-Hans；
        // 对候选标签都注册，命中哪个都能中文显示，重复或非法标签忽略即可。
        for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant']) {
          ctx.effect(() => {
            try { return ctx.locale.register(NS, tag, ZH); } catch (error) { return () => {}; }
          }, 'recsdk-review: zh dictionary ' + tag);
        }
        for (const tag of ['en', 'en-US']) {
          ctx.effect(() => {
            try { return ctx.locale.register(NS, tag, EN); } catch (error) { return () => {}; }
          }, 'recsdk-review: en dictionary ' + tag);
        }
        let t = (key) => key;
        try { t = ctx.locale.bind(NS); } catch { t = (key) => key; }
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
