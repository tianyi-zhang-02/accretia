# Accretia

[English](README.md) · **简体中文**

[![release](https://img.shields.io/github/v/release/tianyi-zhang-02/accretia)](https://github.com/tianyi-zhang-02/accretia/releases) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

_见证财富的复利增长。_ 一个单页、**纯前端**的财富推算模拟器。根据你自己的假设——职业收入、额外收入、大额支出、消费升级，以及低/中/高三档收益率——逐年推算家庭净资产，并回答「要在 Y 岁前达到 X 元，需要什么条件？」。

一切都在浏览器里运行。**没有后端、没有数据库、没有账号，不保存也不上传任何数据。** 刷新即从头开始;用「导出／导入」把方案存成 JSON 文件。

> 技术栈:Next.js 16(App Router)· TypeScript · Tailwind v4 · Recharts · Zod。没有环境变量,没有服务器。

**线上地址:** https://tracker-gamma-eight-14.vercel.app

---

## 功能

**为自己的情况建模**

- **逐年推算** — 纯粹、确定性、有测试覆盖的引擎(通胀口径明确,收益率低/中/高三档)。
- **含股权的职业收入** — 多成员、多阶段,含基本工资、奖金和**每年股权／RSU**。内置可浏览、可搜索、双语的**职业库**——科技(L3–L7)、医疗、法律、金融——提供示例起始数字。
- **储蓄为推导值** — 无储蓄率输入项:每年税后扣开支后剩多少就存多少,隐含储蓄率作为输出显示。
- **税率预设** — 粗略的州 + 联邦实际税率(全 50 州 + 特区),可完全自定义。
- **房产与房贷 what-if** — 把房产计为资产、房贷计为负债:首付→房产净值,利息/房产税/维护为成本,本金转净值,房产逐年增值;显示月供。
- **资产配比计算器** — 从股票、高息存款、债券、房产混合出一个收益率(扣除房产税等持有成本),一键应用到收益率区间。
- **额外收入、大额支出、消费升级。**

**回答问题**

- **FIRE** — 工作变成可选的那一年:**完全 / 精简 / Coast**,可设医保预留。
- **目标求解** — 设「50 岁前 500 万」,对四个可调项(多存、提高收益、少花、多给时间)二分求解。
- **蒙特卡洛** — **确定性 ⇄ 概率** 开关:1000 条随机市场路径 → p10/p50/p90 扇形 + **达标概率**。
- **压力测试** — 失业 / 股灾 what-if(冲击多大、最低点在哪、能否恢复)。
- **名义 vs 实际**(通胀调整),含阴影「差异」视图;**方案对比**;逐年明细表。

**按你的方式用**

- **100% 前端** — 不保存、不上传。**导出／导入** JSON 是唯一的持久化方式。
- **中英双语**(原生中文,非机翻)、**明暗主题**、**字体缩放**,以及**默认精简** + 「高级工具」开关。
- **可安装为 PWA**,离线可用。

界面是一个**实时并排编辑器**:左侧假设条件,右侧固定显示推算结果(期末净资产 + 图表 + 高级工具),改动任一假设图表即时更新。手机上改为上下堆叠(结果在上)。

---

## 隐私与安全

因为没有后端,安全模型非常简单:

- **数据不离开你的设备。** 没有任何 API 调用、埋点、遥测、Cookie 或 `localStorage`。打开开发者工具的「网络」面板,你只会看到页面本身的加载,别无其他。
- **没有任何密钥或环境变量。** 没有可泄露的东西。
- **严格的内容安全策略(CSP)**,每次请求都带随机 nonce(`src/proxy.ts`):`script-src 'self' 'nonce-…' 'strict-dynamic'`(不含 `unsafe-inline`、`unsafe-eval`),`connect-src 'self'`;并在 `next.config.ts` 中附加静态加固响应头(HSTS、X-Frame-Options DENY、nosniff、Referrer-Policy、Permissions-Policy)。
- **导入的 JSON 先经校验** —— 在使用前用引擎的 Zod schema 校验,格式错误的文件不会拖垮推算。

---

## 本地运行

不需要账号、数据库或密钥——克隆下来即可运行。

```bash
git clone https://github.com/tianyi-zhang-02/accretia.git
cd accretia
npm install
npm run dev     # → http://localhost:3000
```

可部署到任何支持 Next.js 的平台(Vercel:导入仓库、点击部署即可——没有环境变量需要配置)。

## 脚本

| 命令                                 | 作用                              |
| ------------------------------------ | --------------------------------- |
| `npm run dev`                        | 在 `localhost:3000` 启动开发服务器 |
| `npm run build` / `npm run start`    | 生产构建 / 启动                    |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript 检查          |
| `npm test`                           | Vitest——引擎、FIRE、蒙特卡洛、房贷、压力测试、目标求解 |
| `npm run format`                     | Prettier                          |

---

## 架构

刻意做得很小。

```
src/
  app/
    page.tsx              入口:渲染模拟器客户端
    simulator-client.tsx  全部 UI 状态(方案、实时编辑器、导出/导入)
    layout.tsx            字体 + 全局样式 + PWA 注册
    manifest.ts, icon*.tsx, apple-icon.tsx   PWA 资源
  proxy.ts                每次请求的 CSP nonce(唯一的「服务端」代码)
  components/
    simulator/            假设表单、对比、目标求解、FIRE、压力测试、逐年表
    charts/               推算图表 + 蒙特卡洛扇形
    i18n/lang-switch.tsx  EN · 中文 切换
    pwa/sw-register.tsx
  lib/
    simulator/            引擎 + 目标求解 + 蒙特卡洛 + FIRE + 预设(含测试)
    i18n/                 中英文案目录 + 语言 Provider
    validation/scenarios.ts   引擎读取的 Zod schema
    format/money.ts
```

**引擎**(`src/lib/simulator/engine.ts`)是纯函数:`simulate(assumptions) → 逐年数据`,无 I/O。其余功能都**附加**在它之上:二分法目标求解、FIRE、蒙特卡洛、压力测试都复用同一套数学;设了房贷时会给净资产加上房产资产与房贷负债。全部有单元测试覆盖(`npm test`)——包括「无房贷 / 波动率为 0 = 原始推算,完全一致」的回归测试。

## 许可证

MIT——见 [LICENSE](LICENSE)。
