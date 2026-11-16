# 来源资料约定

机器人离线回放收件服务。采集端在接收位姿观测的同时收取坐标系变换与重设边界，记录每条位姿的解释路径、发布者与时钟域；不把位置自动转换到世界系，也不做空间轨迹重建。

## 交互与身份

GET /pose为单份原始位姿；GET /observations返回run、clock、epoch、frame、time、position。GET /transforms返回parent/child/publisher/clock/epoch/time/static/translation/rotation；rotation为[x,y,z,w]。GET /epochs返回重设边界。动态记录只在同一epoch内解释，parent切换也是边界；static记录以calibration标识，不按抓取时间排序。多发布者对同一child给出冲突父关系时无默认权威。 采集端保留原始变换与可解释路径，不要求实现空间轨迹重建；没有同epoch覆盖证据时不得外推。

## 采集端解释规则

`src/reader.mjs`每次收件同时拉取/observations、/transforms、/epochs（来源暂未提供的端点按空集合处理，错误响应仍进入原文凭据），塑造成observation、transform、epoch三类结构化记录，并由`src/frames.mjs`与`src/resolver.mjs`产出interpretation解释记录：

- 动态边只在与观测同一clock、同一epoch、采样时刻不晚于观测时刻、且落在/epochs声明区间内时适用；跨时钟域、跨epoch边界、晚于观测的样本记入blocked并标注原因，不做插值或外推。
- 静态标定按calibration标识区分版本，永不按抓取时间覆盖；同一child同一parent存在多版标定且无法选定唯一标识时按ambiguous-calibration悬置。
- 同一适用时刻存在不同parent或不同publisher的候选时按conflicting-parents悬置；路径上某帧没有任何适用边时按missing-transform悬置并保留已走过的partialPath。
- 解释记录的path逐边保留transformId、publisher、clock、epoch、calibration，evidence引用对应原文凭据receiptId；status为interpreted或pending，pending必须带reason。
- 重估只针对本次收件涉及run（观测/变换所属run，以及新重设边界同时钟域下的run）；已确认的interpreted解释不重写，其他run的历史记录完全不参与，新版本解释随归档追加、旧版本按内容摘要保留。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：conflict、reset、backfill。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。backfill阶段模拟新epoch动态关系晚到，用于验证悬置观测的补齐。

## 收件边界

`src/reader.mjs`收取/observations、/transforms、/epochs并保留/pose类资料的原文凭据能力。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
