import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretObservation, interpretationId, PENDING_REASONS, BLOCKED_REASONS} from '../src/frames.mjs';
import {resolveRecords, summarize} from '../src/resolver.mjs';

let seq = 0;
const observation = overrides => ({
 kind: 'observation', id: 'obs:r1:o1', run: 'r1', observationId: 'o1',
 clock: 'c1', epoch: 1, time: 10, frame: 'tool', position: [1, 2, 3], evidence: ['rcp-obs'], ...overrides
});
const transform = overrides => ({
 kind: 'transform', id: `tf-${seq++}`, run: 'r1', parent: 'base', child: 'tool', publisher: 'arm',
 static: false, calibration: null, clock: 'c1', epoch: 1, time: 9,
 translation: [0, 0, 1], rotation: [0, 0, 0, 1], evidence: ['rcp-tf'], ...overrides
});
const staticTransform = overrides => transform({
 static: true, calibration: 'cal1', clock: null, epoch: null, time: null, ...overrides
});
const epochRecord = overrides => ({
 kind: 'epoch', id: 'epoch:c1:1', clock: 'c1', epoch: 1, start: 0, end: 20, evidence: ['rcp-epoch'], ...overrides
});

const find = (result, edgeId) => {
 const edge = result.path.find(item => item.transformId === edgeId);
 assert.ok(edge, `路径缺少 ${edgeId}`);
 return edge;
};

test('同时钟同 epoch 的动态链与静态标定共同解释位姿', () => {
 const dynamic = transform();
 const calibration = staticTransform({id: 'tf-base', parent: 'world', child: 'base', publisher: 'cal'});
 const result = interpretObservation(observation(), [dynamic, calibration], [epochRecord()]);
 assert.equal(result.status, 'interpreted');
 assert.equal(result.root, 'world');
 assert.deepEqual(result.path.map(edge => edge.child), ['tool', 'base']);
 assert.equal(find(result, dynamic.id).publisher, 'arm');
 assert.equal(find(result, calibration.id).calibration, 'cal1');
 assert.ok(result.evidence.includes('rcp-tf') && result.evidence.includes('rcp-obs') && result.evidence.includes('rcp-epoch'));
});

test('多发布者对同一 child 给出不同父关系时悬置并保留候选', () => {
 const first = transform({publisher: 'arm', parent: 'base'});
 const second = transform({publisher: 'camera', parent: 'other'});
 const result = interpretObservation(observation(), [first, second], [epochRecord()]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.CONFLICTING_PARENTS);
 assert.equal(result.candidates.length, 2);
});

test('动态关系不跨重设边界：新 epoch 无变换时悬置', () => {
 const result = interpretObservation(observation({epoch: 2}), [transform({epoch: 1})], [
  epochRecord({epoch: 1, end: 20}), epochRecord({id: 'epoch:c1:2', epoch: 2, end: null})
 ]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.MISSING_TRANSFORM);
 assert.equal(result.blocked[0].reason, BLOCKED_REASONS.EPOCH_BOUNDARY);
});

test('时钟域不同的变换不能解释观测', () => {
 const result = interpretObservation(observation(), [transform({clock: 'c2'})], [epochRecord()]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.MISSING_TRANSFORM);
 assert.equal(result.blocked[0].reason, BLOCKED_REASONS.CLOCK_DOMAIN_MISMATCH);
});

test('晚于观测时刻的动态样本不外推', () => {
 const result = interpretObservation(observation({time: 10}), [transform({time: 11})], [epochRecord()]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.MISSING_TRANSFORM);
 assert.equal(result.blocked[0].reason, BLOCKED_REASONS.SAMPLE_AFTER_OBSERVATION);
});

test('静态标定按 calibration 标识区分版本：多版并存时悬置，不按抓取时间覆盖', () => {
 const first = staticTransform({id: 's1', calibration: 'cal1'});
 const second = staticTransform({id: 's2', calibration: 'cal2'});
 const result = interpretObservation(observation(), [first, second], [epochRecord()]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.AMBIGUOUS_CALIBRATION);
 assert.deepEqual(result.candidates.map(edge => edge.calibration).sort(), ['cal1', 'cal2']);
});

test('唯一标定标识的静态边无时序要求，可独立解释位姿', () => {
 const result = interpretObservation(observation({frame: 'base'}), [
  staticTransform({id: 's1', parent: 'world', child: 'base', publisher: 'cal', calibration: 'cal1'})
 ], []);
 assert.equal(result.status, 'interpreted');
 assert.equal(result.root, 'world');
 assert.equal(result.path[0].clock, null);
});

test('帧上只有不适用的候选变换时按缺变换悬置并保留部分路径与阻断原因', () => {
 const result = interpretObservation(observation({frame: 'gripper'}), [
  transform({id: 'tf-g', parent: 'flange', child: 'gripper'}),
  transform({id: 'tf-f', parent: 'tool', child: 'flange', epoch: 2})
 ], [
  epochRecord(), epochRecord({id: 'epoch:c1:2', epoch: 2, end: null})
 ]);
 assert.equal(result.status, 'pending');
 assert.equal(result.reason, PENDING_REASONS.MISSING_TRANSFORM);
 assert.equal(result.frame, 'flange');
 assert.deepEqual(result.path.map(edge => edge.child), ['gripper']);
 assert.equal(result.blocked[0].reason, BLOCKED_REASONS.EPOCH_BOUNDARY);
});

test('晚到的变换能补齐同 run 的悬置观测', () => {
 const obs = observation();
 const first = resolveRecords([], [obs]);
 assert.equal(first.interpretations[0].status, 'pending');
 const calibration = staticTransform({id: 'tf-base', parent: 'world', child: 'base', publisher: 'cal'});
 const second = resolveRecords([obs, ...first.interpretations], [transform(), calibration, epochRecord()]);
 const refreshed = second.interpretations.find(item => item.id === interpretationId(obs));
 assert.equal(refreshed.status, 'interpreted');
 assert.equal(refreshed.root, 'world');
});

test('已确认的解释不会被后续冲突资料改写', () => {
 const obs = observation();
 const calibration = staticTransform({id: 'tf-base', parent: 'world', child: 'base', publisher: 'cal'});
 const first = resolveRecords([], [obs, transform(), calibration, epochRecord()]);
 const confirmed = first.interpretations[0];
 assert.equal(confirmed.status, 'interpreted');
 const conflicting = transform({publisher: 'camera', parent: 'other'});
 const second = resolveRecords([obs, transform(), calibration, epochRecord(), confirmed], [conflicting]);
 assert.equal(second.interpretations.length, 0);
 assert.equal(summarize([...first.records, ...second.records]).interpreted, 1);
});

test('重估只触及本次来源资料相关的 run，其他实验记录原样保留', () => {
 const other = observation({id: 'obs:r2:o9', run: 'r2', observationId: 'o9', clock: 'c3', epoch: 7});
 const first = resolveRecords([], [other]);
 assert.equal(first.interpretations[0].run, 'r2');
 const obs = observation();
 const calibration = staticTransform({id: 'tf-base', parent: 'world', child: 'base', publisher: 'cal'});
 const second = resolveRecords([other, ...first.interpretations], [obs, transform(), calibration, epochRecord()]);
 assert.ok(second.interpretations.every(item => item.run === 'r1'));
 assert.ok(!second.records.some(record => record.run === 'r2'));
});
