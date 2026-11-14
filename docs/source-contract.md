# 来源资料约定

机器人离线回放收件服务。现有适配器保留单个坐标系内位姿，不把位置自动转换到世界系。

## 交互与身份

GET /pose为单份原始位姿；GET /observations返回run、clock、epoch、frame、time、position。GET /transforms返回parent/child/publisher/clock/epoch/time/static/translation/rotation；rotation为[x,y,z,w]。GET /epochs返回重设边界。动态记录只在同一epoch内解释，parent切换也是边界；static记录以calibration标识，不按抓取时间排序。多发布者对同一child给出冲突父关系时无默认权威。 采集端保留原始变换与可解释路径，不要求实现空间轨迹重建；没有同epoch覆盖证据时不得外推。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：conflict、reset。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 已有收件边界

当前`src/reader.mjs`只收取/pose提供的已整理资料。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
