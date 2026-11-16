# 机器人回放资料的坐标系历史采集

机器人离线回放收件服务。采集端在接收位姿观测的同时收取当时适用的坐标系变换与重设边界，为每条位姿记录解释路径、发布者与时钟域；缺变换或证据冲突的位姿保持悬置并注明原因，不把位置自动转换到世界系。

## 运行

使用 Node.js 22，依赖由 package-lock.json 固定。安装后可执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
npm start
```

服务启动本地来源与收件接口，默认端口分别为4011和4010。`POST /collect` 领取当前观测、变换与重设边界并重估受影响观测；`GET /records`查看结构化记录，`GET /interpretations`查看解释状态汇总与每条位姿的路径依据，`GET /receipts`查看原文凭据，`GET /health`查看服务状态。`PORT`、`SOURCE_PORT`与`DATA_DIR`可分别设置端口和归档目录。

```sh
docker build -t robot-frame-history .
docker run --rm --network none robot-frame-history npm test
docker run --rm --network none robot-frame-history npm run demo
docker run --rm -p 4010:4010 robot-frame-history
```

## 资料组织

`provider/`是独立本地来源，`fixtures/`记录合成资料和来源阶段（normal、conflict、reset、backfill），`src/reader.mjs`负责收件与记录塑造，`src/frames.mjs`按时钟域、epoch边界与标定标识判定单条观测的解释路径，`src/resolver.mjs`合并归档历史并只重估本次涉及run的悬置观测，`src/source.mjs`限定来源地址并记录响应字节，`src/archive.mjs`保存按摘要校验的原文与资料版本。`test/`覆盖路径判定、冲突与悬置、晚到补齐、run隔离、原文完整性和服务联通。运行不依赖外网、数据库服务或真实设备。

## 判定与修订规则

- 动态变换只在同一clock、同一epoch、采样不晚于观测且落在重设区间内时适用；跨时钟域或跨epoch的候选只记录阻断原因，不插值不外推。
- 静态标定以calibration标识区分版本，不按抓取时间覆盖；同一parent存在多版标定时悬置。
- 同一时刻多parent或多publisher无默认权威，按冲突悬置；解释记录保留path、blocked候选与原文凭据引用。
- 已确认（interpreted）的解释不被后续资料改写；晚到资料只补齐同run的悬置观测，其他实验的已确认记录原样保留，所有修订按内容摘要追加归档。

完整来源约定见 `docs/source-contract.md`。项目只访问本地合成资料，不携带真实身份、密钥或业务数据。

## 快速查看

`npm run demo`启动实际来源和收件服务，依次演示冲突悬置、重设边界、晚到补齐并打印解释结果及凭据，临时归档在退出时清理。正常完成时间小于90秒；需要保留数据时用`npm start`及独立`DATA_DIR`。演示反映当前产品能力，不代表全部来源资料已被接纳。
