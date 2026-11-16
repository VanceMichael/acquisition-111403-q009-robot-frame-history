import {digest, receiptId} from './archive.mjs';
import {resolveRecords} from './resolver.mjs';

// 404 表示来源暂未提供该类资料，按空集合处理；其余错误向上抛出。
async function fetchDocument(client, path) {
 try {
  return await client(path);
 } catch (error) {
  if (error.status === 404) return null;
  throw error;
 }
}

// 找到本次对 path 的原始响应凭据，结构化记录通过 receiptId 引用原文。
function receiptFor(client, path) {
 const target = new URL(path, client.origin).href;
 for (let index = client.exchanges.length - 1; index >= 0; index -= 1) {
  const exchange = client.exchanges[index];
  if (exchange.url === target) {
   return receiptId(exchange.url, exchange.status, digest(exchange.bytes));
  }
 }
 return null;
}

function shapeObservations(document, evidence) {
 if (!document || !Array.isArray(document.items)) return [];
 return document.items
  .filter(item => item && item.run && item.id && item.frame && item.clock !== undefined)
  .map(item => ({
   kind: 'observation',
   id: `obs:${item.run}:${item.id}`,
   run: item.run,
   observationId: item.id,
   clock: item.clock,
   epoch: item.epoch ?? null,
   frame: item.frame,
   time: item.time ?? null,
   position: item.position,
   evidence
  }));
}

function shapeTransforms(document, evidence) {
 if (!document || !Array.isArray(document.items)) return [];
 return document.items
  .filter(item => item && item.run && item.parent && item.child && item.publisher)
  .map(item => {
   const isStatic = item.static === true;
   const identity = isStatic
    ? `static:${item.calibration ?? 'uncalibrated'}`
    : `dynamic:${item.clock ?? 'unknown-clock'}:${item.epoch ?? 'unknown-epoch'}:${item.time ?? 'unknown-time'}`;
   return {
    kind: 'transform',
    id: `tf:${item.run}:${item.child}:${item.parent}:${item.publisher}:${identity}`,
    run: item.run,
    parent: item.parent,
    child: item.child,
    publisher: item.publisher,
    static: isStatic,
    calibration: isStatic ? (item.calibration ?? null) : null,
    clock: item.clock ?? null,
    epoch: item.epoch ?? null,
    time: item.time ?? null,
    translation: item.translation,
    rotation: item.rotation,
    evidence
   };
  });
}

function shapeEpochs(document, evidence) {
 if (!document || !Array.isArray(document.epochs)) return [];
 return document.epochs
  .filter(item => item && document.clock && item.epoch !== undefined)
  .map(item => ({
   kind: 'epoch',
   id: `epoch:${document.clock}:${item.epoch}`,
   clock: document.clock,
   epoch: item.epoch,
   start: item.start,
   end: item.end ?? null,
   evidence
  }));
}

// 收取来源当前的观测、变换与重设边界，并结合归档历史给出解释。
// 返回的 records 包含本次新到资料与新产生的解释，交由归档层追加去重。
export async function collect(client, history = []) {
 const [observationsDoc, transformsDoc, epochsDoc] = await Promise.all([
  fetchDocument(client, '/observations'),
  fetchDocument(client, '/transforms'),
  fetchDocument(client, '/epochs')
 ]);
 const incoming = [
  ...shapeObservations(observationsDoc, [receiptFor(client, '/observations')].filter(Boolean)),
  ...shapeTransforms(transformsDoc, [receiptFor(client, '/transforms')].filter(Boolean)),
  ...shapeEpochs(epochsDoc, [receiptFor(client, '/epochs')].filter(Boolean))
 ];
 const resolved = resolveRecords(history, incoming);
 return {records: resolved.records, interpretations: resolved.interpretations};
}
