# Accretia

[English](README.md) · **简体中文**

_见证财富的复利增长。_ 一个单页、**纯前端**的财富推算模拟器。根据你自己的假设——职业收入、额外收入、大额支出、消费升级，以及低/中/高三档收益率——逐年推算家庭净资产，并回答「要在 Y 岁前达到 X 元，需要什么条件？」。

一切都在浏览器里运行。**没有后端、没有数据库、没有账号，不保存也不上传任何数据。** 刷新即从头开始;用「导出／导入」把方案存成 JSON 文件。

> 技术栈:Next.js 16(App Router)· TypeScript · Tailwind v4 · Recharts · Zod。没有环境变量,没有服务器。

**线上地址:** https://tracker-gamma-eight-14.vercel.app

> 🏁 **我的梦车**:911 Turbo S + GT3 Touring —— 我要靠自己赚钱买下他们,嘿嘿嘿 :) 慢慢来,复利会带我到那儿。

<p align="center"><img src="assets/dream-cars.svg" alt="911 Turbo S · 911 GT3 Touring" width="520"></p>

---

## 功能

- **逐年推算** — 由一个纯粹、确定性的引擎计算(通胀口径有明确约定,收益率分低/中/高三档)。
- **含股权的职业收入** — 可添加多位成员、多个职业阶段,每个阶段包含基本工资、奖金和**每年股权／RSU**(对大厂和 AI 实验室岗位而言,股权往往是总薪酬的大头)。内置可浏览、分组、可搜索的**职业库**(法律 · 软件/机器学习),提供示例起始数字。
- **储蓄为推导值** — 没有单独的储蓄率输入项:每年税后收入扣除开支后,剩下多少就存多少。隐含储蓄率作为输出显示。
- **税率预设** — 一份粗略的州 + 联邦实际税率估算(覆盖全部 50 州 + 华盛顿特区)用于填充单一税率,可完全自定义。仅供参考,不构成税务建议,并标注「最近更新」日期。
- **额外收入与大额支出** — 支持一次性或周期性,并在图表上以标记点显示。
- **消费升级** — 刻画开支随时间上升(在通胀之上固定增幅,或吸收每次加薪的一部分)。
- **目标求解** — 设定一个目标(如「50 岁前 500 万美元」),模拟器通过对引擎做二分法求解,分别给出四个可调项(多存、提高收益、少花、多给时间)。
- **方案对比** — 多个方案并排比较。
- **名义／实际** 切换,以及逐年明细表。
- **导出／导入** JSON 方案——这是唯一的持久化方式(不会自动保存任何数据)。
- **可安装为 PWA**,离线可用(本质上只是静态资源 + 前端 JS)。
- **中英双语——English / 简体中文** — 全程原生中文(非机器翻译),包括职业库与目标求解。用页首的 `EN · 中文` 开关切换,或用 `?lang=zh` 链接;语言选择保存在 URL 里,不写入任何存储。

界面是一个**实时并排编辑器**:左侧是假设条件,右侧固定显示推算结果(期末净资产 + 图表 + 目标求解),改动任一假设,图表实时更新。**对比**是方案栏里的一个开关。在手机上则改为上下堆叠(推算结果在上)。

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
| `npm test`                           | Vitest(引擎 + 目标求解单元测试)  |
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
    simulator/            假设表单、对比、目标求解面板、逐年表
    charts/simulator-chart.tsx
    i18n/lang-switch.tsx  EN · 中文 切换
    pwa/sw-register.tsx
  lib/
    simulator/            纯引擎 + 目标求解 + 预设(含测试)
    i18n/                 中英文案目录 + 语言 Provider
    validation/scenarios.ts   引擎读取的 Zod schema
    format/money.ts
```

**引擎**(`src/lib/simulator/engine.ts`)是一个纯函数:`simulate(assumptions) → 逐年数据`,没有任何 I/O。无论你在编辑、对比还是目标求解,用的都是同一套数学,并有单元测试覆盖(`npm test`)。

## 许可证

MIT——见 [LICENSE](LICENSE)。
