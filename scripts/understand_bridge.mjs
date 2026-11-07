// Controller-owned adapter around the pinned MIT Understand core.
// Never imports or executes anything from the candidate repository.
import {readFileSync, writeFileSync, existsSync, lstatSync} from 'node:fs';
import {resolve, extname, dirname, posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = await import(pathToFileURL(resolve(root, 'vendor/understand-anything/understand-anything-plugin/packages/core/dist/index.js')).href);
const [requestPath, outputPath] = process.argv.slice(2);
const request = JSON.parse(readFileSync(requestPath, 'utf8'));
const configs = core.builtinLanguageConfigs.filter(c => ['python','cpp','c','typescript','javascript','go','rust','java'].includes(c.id));
const plugin = new core.TreeSitterPlugin(configs);
await plugin.init();
const previous = request.previous || {};
const files = {};
const gaps = [];
let reused = 0, parsed = 0;
const codeExtensions = new Set(configs.flatMap(c => c.extensions.map(e => e.startsWith('.') ? e : '.'+e)));
for (const rel of request.files) {
  const absolute = resolve(request.workspace, rel);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink()) {gaps.push(`${rel}: not a regular source file`); continue;}
  const bytes = readFileSync(absolute);
  if (bytes.includes(0) || bytes.length > request.maxFileBytes) {gaps.push(`${rel}: binary or exceeds file size limit`); continue;}
  const hash = createHash('sha256').update(bytes).digest('hex');
  if(previous[rel]?.hash === hash) {files[rel] = previous[rel]; reused++; continue;}
  const content = bytes.toString('utf8');
  let structure = null, callGraph = [];
  if(codeExtensions.has(extname(rel))) {
    try {
      // .h in this project frequently contains C++ classes/templates.
      const parserPath = rel.endsWith('.h') ? rel + '.hpp' : rel;
      const result = plugin.analyzeFileStrict(parserPath, content);
      if(result.status==='succeeded') {
        structure = result.structure; callGraph = plugin.extractCallGraph(parserPath,content);
        parsed++;
      } else gaps.push(`${rel}: ${result.status}; inventory-only`);
    } catch(e) {gaps.push(`${rel}: parser failure ${e.message}`);}
  }
  files[rel] = {hash, structure, callGraph, lines:content.split('\n').length,
                coverage: structure ? 'structural' : 'inventory-only'};
}
const builder = new core.GraphBuilder(request.project, request.commit);
for(const [path, item] of Object.entries(files)) {
  const meta = {summary:`源码索引：${path}；语义需结合领域知识和原文核对`, tags:[],complexity:'moderate'};
  if(item.structure) builder.addFileWithAnalysis(path,item.structure,{...meta,fileSummary:meta.summary,summaries:{}});
  else builder.addFile(path,meta);
}
const graph = builder.build();
const nodeIds = new Set(graph.nodes.map(n=>n.id));
const fileSet = new Set(Object.keys(files));
const symbolMap = new Map();
for(const n of graph.nodes) if(['function','class'].includes(n.type)) {
  const entries = symbolMap.get(n.name) || []; entries.push(n); symbolMap.set(n.name,entries);
}
function edge(source,target,type,weight) {
  if(nodeIds.has(source) && nodeIds.has(target)) graph.edges.push({source,target,type,direction:'forward',weight});
}
for(const [path,item] of Object.entries(files)) {
  for(const imp of item.structure?.imports || []) {
    const raw = imp.source.replaceAll('.', '/');
    const candidates = [imp.source, posix.join(posix.dirname(path),imp.source),raw,posix.join(posix.dirname(path),raw)];
    const options = new Set(candidates.flatMap(p=>[p,...['.py','.cpp','.h','.hpp','.ts','.js','/__init__.py','/index.ts'].map(s=>p+s)]).filter(p=>fileSet.has(p)));
    if(options.size===1) edge(`file:${path}`,`file:${[...options][0]}`,'imports',1);
  }
  for(const call of item.callGraph || []) {
    const callers = (symbolMap.get(call.caller)||[]).filter(n=>n.filePath===path);
    const targets = symbolMap.get(call.callee)||[];
    const local = targets.filter(n=>n.filePath===path);
    const resolved = local.length===1 ? local : targets;
    // Never join identically named functions across modules by an arbitrary guess.
    if(callers.length===1 && resolved.length===1) edge(callers[0].id,resolved[0].id,'calls',local.length===1?1:0.6);
  }
}
const unique = new Map(graph.edges.map(e=>[`${e.source}\0${e.target}\0${e.type}`,e]));
graph.edges = [...unique.values()];
const known = new Set(graph.nodes.map(n=>n.id));
if(graph.edges.some(e=>!known.has(e.source)||!known.has(e.target))) throw new Error('Dangling graph edge');
writeFileSync(outputPath, JSON.stringify({graph,files,stats:{reused,parsed,total:Object.keys(files).length},gaps,
  limitations:['跨语言绑定、动态分派、AscendC 宏、外部依赖及未唯一解析的调用需源码补证；空调用集合不代表无影响。']}));
