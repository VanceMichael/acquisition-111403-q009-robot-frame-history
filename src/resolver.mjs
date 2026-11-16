// 收件解析：把归档历史与本次新到资料合并，重新解释受影响 run 的观测。
// 已确认（interpreted）的解释不重写；本次未触及的 run 完全不参与重估；
// 新解释作为追加版本进入归档，旧版本由归档层按内容摘要保留。

import {interpretObservation, interpretationId} from './frames.mjs';

const byKind = (records, kind) => records.filter(record => record.kind === kind);

export function resolveRecords(history, incoming) {
 const prior = history.filter(record => record.kind !== 'interpretation');
 const priorInterpretations = byKind(history, 'interpretation');

 // 知识基线：历史资料 + 本次新到资料。同标识同内容的资料在归档层自然去重。
 const knowledge = [...prior];
 const knownIds = new Set(knowledge.map(record => record.id));
 for (const record of incoming) {
  if (!knownIds.has(record.id)) {
   knowledge.push(record);
   knownIds.add(record.id);
  }
 }

 // 本次收件涉及的 run：新观测/新变换所属 run，以及新重设边界同时钟域下的 run。
 const touchedRuns = new Set(incoming
  .filter(record => record.kind === 'observation' || record.kind === 'transform')
  .map(record => record.run));
 const epochClocks = new Set(incoming
  .filter(record => record.kind === 'epoch')
  .map(record => record.clock));
 for (const observation of byKind(knowledge, 'observation')) {
  if (epochClocks.has(observation.clock)) touchedRuns.add(observation.run);
 }

 // 已确认的解释不重写；同 run 的悬置观测才允许补齐。
 const confirmed = new Set(priorInterpretations
  .filter(record => record.status === 'interpreted')
  .map(record => record.id));

 const transforms = byKind(knowledge, 'transform');
 const epochs = byKind(knowledge, 'epoch');
 const newInterpretations = [];
 for (const observation of byKind(knowledge, 'observation')) {
  if (!touchedRuns.has(observation.run)) continue;
  if (confirmed.has(interpretationId(observation))) continue;
  newInterpretations.push(interpretObservation(observation, transforms, epochs));
 }

 return {
  records: [...incoming, ...newInterpretations],
  interpretations: newInterpretations
 };
}

export function summarize(records) {
 const interpretations = byKind(records, 'interpretation');
 const pending = interpretations.filter(record => record.status === 'pending');
 return {
  total: interpretations.length,
  interpreted: interpretations.length - pending.length,
  pending: pending.length,
  pendingByReason: pending.reduce((counts, record) => {
   counts[record.reason] = (counts[record.reason] ?? 0) + 1;
   return counts;
  }, {})
 };
}
