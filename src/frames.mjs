// 坐标系路径解释：依据已收件的变换与重设边界，判断单条位姿观测能否被解释。
// 本模块只做证据判定与路径记录，不做空间轨迹重建或外推。

export const PENDING_REASONS = {
 MISSING_TRANSFORM: 'missing-transform',
 CONFLICTING_PARENTS: 'conflicting-parents',
 AMBIGUOUS_CALIBRATION: 'ambiguous-calibration',
 FRAME_CYCLE: 'frame-cycle'
};

export const BLOCKED_REASONS = {
 CLOCK_DOMAIN_MISMATCH: 'clock-domain-mismatch',
 EPOCH_BOUNDARY: 'epoch-boundary',
 OUTSIDE_EPOCH_SPAN: 'outside-epoch-span',
 SAMPLE_AFTER_OBSERVATION: 'sample-after-observation'
};

const edgeRef = transform => ({
 transformId: transform.id,
 parent: transform.parent,
 child: transform.child,
 publisher: transform.publisher,
 static: transform.static,
 calibration: transform.calibration,
 clock: transform.clock,
 epoch: transform.epoch,
 time: transform.time
});

export function interpretationId(observation) {
 return `interp:${observation.run}:${observation.observationId}`;
}

function baseInterpretation(observation) {
 return {
  kind: 'interpretation',
  id: interpretationId(observation),
  run: observation.run,
  observationId: observation.observationId,
  clock: observation.clock,
  epoch: observation.epoch,
  time: observation.time,
  frame: observation.frame,
  status: 'pending',
  reason: null,
  root: null,
  path: [],
  candidates: [],
  blocked: [],
  evidence: []
 };
}

// 对单条观测做坐标系路径判定。transforms/epochs 为归档中同一来源的全部已知记录。
export function interpretObservation(observation, transforms, epochs) {
 const result = baseInterpretation(observation);
 const sameRun = transforms.filter(record => record.run === observation.run);
 const transformById = new Map(transforms.map(record => [record.id, record]));
 const spans = new Map(epochs
  .filter(record => record.clock === observation.clock)
  .map(record => [record.epoch, record]));
 const inDeclaredSpan = sample => {
  const span = spans.get(sample.epoch);
  if (!span) return true;
  if (sample.time < span.start) return false;
  return span.end === null || sample.time <= span.end;
 };

 const finishPending = (reason, extra = {}) => {
  result.reason = reason;
  Object.assign(result, extra);
  result.path = extra.partialPath ?? [];
  return result;
 };
 const finishInterpreted = (root, path) => {
  result.status = 'interpreted';
  result.root = root;
  result.path = path;
  const evidence = new Set(observation.evidence ?? []);
  const span = spans.get(observation.epoch);
  if (span) (span.evidence ?? []).forEach(receipt => evidence.add(receipt));
  for (const edge of path) {
   (transformById.get(edge.transformId)?.evidence ?? []).forEach(receipt => evidence.add(receipt));
  }
  result.evidence = [...evidence];
  return result;
 };

 const path = [];
 const blocked = [];
 const visited = new Set();
 let current = observation.frame;

 while (true) {
  if (visited.has(current)) {
   return finishPending(PENDING_REASONS.FRAME_CYCLE, {partialPath: path, blocked, frame: current});
  }
  visited.add(current);

  const edges = sameRun.filter(record => record.child === current);
  if (edges.length === 0) {
   if (path.length === 0) {
    return finishPending(PENDING_REASONS.MISSING_TRANSFORM, {frame: current, blocked});
   }
   return finishInterpreted(current, path);
  }

  // 静态标定：以 calibration 标识区分版本，不按抓取时间排序或覆盖。
  const staticByParent = new Map();
  for (const transform of edges.filter(record => record.static)) {
   if (!staticByParent.has(transform.parent)) staticByParent.set(transform.parent, new Map());
   const calibrations = staticByParent.get(transform.parent);
   if (!calibrations.has(transform.calibration)) calibrations.set(transform.calibration, transform);
  }
  const staticCandidates = [];
  for (const [, calibrations] of staticByParent) {
   if (calibrations.size > 1) {
    return finishPending(PENDING_REASONS.AMBIGUOUS_CALIBRATION, {
     frame: current,
     partialPath: path,
     blocked,
     candidates: [...calibrations.values()].map(edgeRef)
    });
   }
   staticCandidates.push(calibrations.values().next().value);
  }

  // 动态关系：必须同时钟、同 epoch、落在重设区间内、且不晚于观测时刻，禁止跨边界插值与外推。
  const applicable = [];
  for (const transform of edges.filter(record => !record.static)) {
   let reason = null;
   if (transform.clock !== observation.clock) reason = BLOCKED_REASONS.CLOCK_DOMAIN_MISMATCH;
   else if (transform.epoch !== observation.epoch) reason = BLOCKED_REASONS.EPOCH_BOUNDARY;
   else if (!inDeclaredSpan(transform)) reason = BLOCKED_REASONS.OUTSIDE_EPOCH_SPAN;
   else if (transform.time > observation.time) reason = BLOCKED_REASONS.SAMPLE_AFTER_OBSERVATION;
   if (reason) blocked.push({...edgeRef(transform), reason});
   else applicable.push(transform);
  }

  let dynamicCandidate = null;
  if (applicable.length > 0) {
   const latestTime = Math.max(...applicable.map(record => record.time));
   const atLatest = applicable.filter(record => record.time === latestTime);
   const parents = new Set(atLatest.map(record => record.parent));
   const publishers = new Set(atLatest.map(record => record.publisher));
   // 同一时刻出现不同父系或不同发布者，契约规定无默认权威，按冲突悬置。
   if (parents.size > 1 || publishers.size > 1) {
    return finishPending(PENDING_REASONS.CONFLICTING_PARENTS, {
     frame: current,
     partialPath: path,
     blocked,
     candidates: atLatest.map(edgeRef)
    });
   }
   dynamicCandidate = atLatest[0];
  }

  const candidates = [...staticCandidates];
  if (dynamicCandidate) candidates.push(dynamicCandidate);
  const candidateParents = new Set(candidates.map(record => record.parent));
  if (candidateParents.size > 1) {
   return finishPending(PENDING_REASONS.CONFLICTING_PARENTS, {
    frame: current,
    partialPath: path,
    blocked,
    candidates: candidates.map(edgeRef)
   });
  }
  if (candidates.length === 0) {
   return finishPending(PENDING_REASONS.MISSING_TRANSFORM, {
    frame: current,
    partialPath: path,
    blocked
   });
  }

  const chosen = candidates[0];
  path.push(edgeRef(chosen));
  current = chosen.parent;
 }
}
