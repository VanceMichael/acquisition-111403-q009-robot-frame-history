import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startSource} from '../provider/server.mjs';
import {startIntake} from '../src/app.mjs';

async function environment(run) {
 const directory = await mkdtemp(join(tmpdir(), 'intake-e2e-'));
 const source = await startSource();
 const intake = await startIntake({origin: source.origin, directory});
 const collect = async () => {
  const response = await fetch(intake.origin + '/collect', {method: 'POST'});
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
 };
 const interpretations = async () => (await (await fetch(intake.origin + '/interpretations')).json());
 try { await run({source, intake, collect, interpretations}); }
 finally { await intake.close(); await source.close(); await rm(directory, {recursive: true, force: true}); }
}

test('正常阶段：位姿沿动态链与静态标定得到可解释路径，并记录路径依据与时钟域', () => environment(async ({collect, interpretations}) => {
 await collect();
 const view = await interpretations();
 assert.equal(view.summary.interpreted, 1);
 assert.equal(view.summary.pending, 0);
 const item = view.items[0];
 assert.equal(item.status, 'interpreted');
 assert.equal(item.root, 'world');
 assert.deepEqual(item.path.map(edge => edge.child), ['tool', 'base']);
 assert.equal(item.clock, 'c1');
 assert.deepEqual(item.path.map(edge => edge.clock), ['c1', null]);
 assert.deepEqual(item.path.map(edge => edge.publisher), ['arm', 'cal']);
 assert.ok(item.evidence.length >= 2);
}));

test('冲突阶段：同一 child 的冲突父关系使解释悬置，原文凭据仍完整保留', () => environment(async ({source, collect, interpretations, intake}) => {
 source.setPhase('conflict');
 await collect();
 const view = await interpretations();
 assert.equal(view.summary.interpreted, 0);
 assert.equal(view.summary.pending, 1);
 assert.equal(view.items[0].reason, 'conflicting-parents');
 const receipts = await (await fetch(intake.origin + '/receipts')).json();
 assert.ok(receipts.some(receipt => receipt.url.endsWith('/transforms')));
}));

test('重设阶段：动态关系不跨 epoch，新观测悬置而旧实验的已确认记录不被改写', () => environment(async ({source, collect, interpretations}) => {
 await collect();
 source.setPhase('reset');
 await collect();
 const view = await interpretations();
 assert.equal(view.items.length, 2);
 const first = view.items.find(item => item.observationId === 'o1');
 const second = view.items.find(item => item.observationId === 'o2');
 assert.equal(first.status, 'interpreted');
 assert.equal(second.status, 'pending');
 assert.equal(second.reason, 'missing-transform');
 assert.equal(second.blocked[0].reason, 'epoch-boundary');
}));

test('来源晚到变换资料时补齐同 run 悬置观测，且不产生重复版本', () => environment(async ({source, collect, interpretations}) => {
 source.setPhase('reset');
 await collect();
 let view = await interpretations();
 assert.equal(view.summary.pending, 1);
 const before = view.items[0];
 assert.equal(before.reason, 'missing-transform');

 // 新 epoch 的动态关系晚到：同一观测被补齐为可解释，历史悬置版本作为追加记录保留。
 source.setPhase('backfill');
 await collect();
 view = await interpretations();
 assert.equal(view.summary.interpreted, 1);
 const versions = view.items.filter(item => item.observationId === 'o2');
 assert.equal(versions.length, 2);
 assert.deepEqual(versions.map(item => item.status).sort(), ['interpreted', 'pending']);
 assert.equal(versions.find(item => item.status === 'interpreted').root, 'world');

 // 再收一次相同资料：归档内容寻址去重，记录与凭据数量不变。
 const counts = await collect();
 const again = await collect();
 assert.equal(again.records, counts.records);
 assert.equal(again.exchanges, counts.exchanges);
}));
