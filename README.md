# 本地生活互助平台

当前实现为「好侍达」语音对话手机端原型。

在本目录运行 `npm start`，打开 http://127.0.0.1:5186 。无需安装依赖。支持固定语音剧情、AI 播报及同步文字、模拟语音/点击/文字选择方案、10 秒模拟司机接单、订单详情和模拟联系司机。点击语音球模拟打断，再次点击继续，全程不请求麦克风。

详细说明见 [语音对话说明](voice-conversation/README.md)，验证记录见 [QA](voice-conversation/QA.md)。源码位于 `voice-conversation/dist/`，可作为独立静态页面运行。

`npm run check` 检查语法，`npm test` 验证流程。订单、接单和用户语音均为本地模拟。

## Cloudflare Pages

正式地址：https://haoshida-voice.pages.dev/

2026-10-28 已通过 Direct Upload 发布到 Cloudflare Pages，项目名为 `haoshida-voice`，正式分支为 `main`，发布目录为 `voice-conversation/dist`，无需构建。配置保存在根目录 `wrangler.jsonc`。

后续更新在根目录运行 `npm run deploy`，命令会先执行语法检查和流程测试，再发布当前静态页面。需要可用的 Cloudflare 登录；未登录时先运行 `npx wrangler login`。
