---
name: cwui-enterprise-components
description: 本项目使用 @canway/cw-magic-vue 企业组件库（cwui），编写或修改 UI 代码前必须通过 cwui-knowledge MCP 工具查询组件用法，禁止使用第三方 UI 库和硬编码色值。当用户要求编写 Vue 组件代码、使用 BK 组件、实现页面、还原设计稿、修改组件用法，或提到 bk-button/bk-table/bk-dialog/bk-form 等组件名时，使用此 skill。当用户给出截图或 Figma 链接让你实现界面时也必须触发。即使用户没有明确说"组件库"或"cwui"，只要任务涉及 UI 代码编写就应触发。
license: MIT
compatibility: 使用 @canway/cw-magic-vue 的 Vue 2.x 项目
metadata:
  author: cwui-knowledge
  version: "1.0"
---
<!-- CWUI-KNOWLEDGE-MANAGED:488f6df24afa -->

# Skill: cwui-enterprise-components（企业组件规范与知识库）

## 1. 技能定位

**触发场景（出现以下词句时立即启用）：**
- "写一个列表页 / 表单页 / 弹窗"
- "用 BkTable / BkDialog / BkForm ..."
- "还原设计稿 / 按设计稿开发"
- "帮我实现这个 UI / 界面"
- 用户提供了截图或 Figma 链接让你实现界面
- 任何涉及 UI 组件代码编写的任务

**核心能力：**
1. 使用 `get_component_api` 查询组件精确 API（props/events/slots）
2. 使用 `match_ui_pattern` 将视觉块映射为企业组件组合方案
3. 使用 `lookup_design_token` 将色值反查为 CSS 变量
4. 使用 `check_compliance` 检查代码合规性

## 2. 强制规则

- **禁止使用第三方 UI 库**（Element UI、Ant Design、Vuetify 等），所有 UI 用 cwui 内置组件
- **禁止硬编码色值**，通过 `lookup_design_token` 反查 CSS 变量
- **组件标签统一 PascalCase**：`<BkButton>` 而非 `<bk-button>`
- **表格用 `BkTable`**，不用 CSS Grid 手画；**表单用 `BkForm` + `BkFormItem`**，不手写 label/required 样式

## 3. 工作流（Step-by-Step）

### Step 1：选型

如果是设计还原，先分解设计稿中的视觉块（工具栏、表格、表单、弹窗等），**一次性批量匹配**：

```
match_ui_pattern({queries: ["带分页的数据表格", "搜索工具栏", "表单弹窗"]})
```

如果是功能开发或不确定用哪个组件：

```
find_component({query: "下拉选择"})
```

### Step 2：查 API

对选定的每个组件，**一次性批量查询** props/events/slots。**不要跳过这一步**，组件的绑定方式各有不同（如 BkSwitcher 不支持 v-model）。

```
get_component_api({componentNames: ["table", "pagination", "switcher"]})
```

需要看完整示例时追加调用：

```
get_component_examples({componentName: "table"})
```

### Step 3：查设计 token

对 CSS 中出现的所有色值/尺寸，**一次性批量反查**对应的设计变量（禁止逐个调用）：

```
lookup_design_token({values: ["#1272ff", "#e6e9ee", "#475468", "14px"]})
```

查不到的色值标注 `/* TODO: no token for #xxx */`。

### Step 4：自检

代码完成后，调用合规检查：

```
check_compliance({code: "<完整代码>"})
```

修复所有违规项后再提交。
