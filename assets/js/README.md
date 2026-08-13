# JavaScript 架构

本项目不依赖打包器，所有模块通过 IIFE 挂载到 `window.ChatAI*` 命名空间，并在 `index.html` 中按依赖顺序加载。`app.js` 是 Vue 应用装配层，不再承载可独立运行的数据转换和底层存储实现。

## 目录职责

```text
assets/js/
  api/
    protocol.js              API usage、SSE 和错误协议兼容
  character/
    card-parser.js           外部角色卡和世界书字段标准化
    default-character.js     默认 JSON 人格读取与内部角色构建
    normalizers.js           角色正则和 UI 模板字段标准化
  chat/
    session.js               历史会话标题、摘要、排序和状态兼容
  components/
    app-components.js        无业务状态的 Vue 展示组件
  config/
    app-config.js            产品、人格、供应商、图片和存储静态配置
  core/
    storage.js               IndexedDB、旧库迁移和作用域 key
  memory/
    vector-utils.js          文本分段、向量计算、指纹和词法评分
  app.js                     由构建脚本生成的轻量加载器，不直接编辑
```

## 页面和运行时源码

```text
src/
  app/                       按依赖顺序编号的领域源码片段
  pages/
    fragments/               公共壳、十二个页面主体和业务弹窗源码
pages/                       十二个独立 HTML 入口构建产物
scripts/
  build-app.js               将 src/app 片段清单写入 assets/js/app.js 加载器
  build-pages.js             将页面片段组装为 index.html 和 pages/*.html
```

修改业务流程时编辑 `src/app/*.part.js`，修改页面时编辑 `src/pages/fragments/*.html`，然后运行：

```powershell
node scripts/build-app.js
node scripts/build-pages.js
```

已有 `card-utils.js` 继续负责 PNG 角色卡和导出格式，`ui-select.js` 继续负责现有下拉组件，`utils.js` 只保留 UUID 和思维链解析等通用函数。

## 常见修改入口

- 更换默认人格：只改 `config/app-config.js` 的 `CHAT_AI_CHARACTER_CARD_URL`。
- 调整 API 快捷供应商：改 `config/app-config.js` 的 `API_PROVIDER_OPTIONS`。
- 修改历史会话标题或排序：改 `chat/session.js`。
- 修改角色卡 JSON 兼容规则：改 `character/card-parser.js`。
- 修改角色正则或 UI 模板字段兼容：改 `character/normalizers.js`。
- 修改默认角色卡加载方式：改 `character/default-character.js`。
- 修改 IndexedDB key 或迁移：改 `core/storage.js`，现有 key 不应无迁移直接变更。
- 修改 token/error 兼容：改 `api/protocol.js`。
- 修改向量记忆计算：改 `memory/vector-utils.js`。

## 验证

```powershell
node --test tests/*.test.js
node --check assets/js/app.js
git diff --check
```

`tests/structure.test.js` 会阻止迁出的核心实现重新堆回 `app.js`，也会检查静态脚本加载顺序。
