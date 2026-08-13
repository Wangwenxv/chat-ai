(function loadChatAiApplication() {
    'use strict';

    // 固定清单由构建时生成，浏览器只按顺序读取，不需要扫描目录。
    const fragments = [
        "00-bootstrap.part.js",
        "10-state-core.part.js",
        "11-state-memory.part.js",
        "12-state-tools.part.js",
        "13-state-editors.part.js",
        "14-state-embedded.part.js",
        "20-persistence-sessions.part.js",
        "21-persistence-memory.part.js",
        "22-persistence-character.part.js",
        "23-persistence-watchers.part.js",
        "30-computed.part.js",
        "40-ui-actions.part.js",
        "41-markdown.part.js",
        "42-api-models.part.js",
        "43-chat-actions.part.js",
        "44-chat-generation.part.js",
        "45-image-generation.part.js",
        "50-memory-extraction.part.js",
        "51-memory-recall.part.js",
        "52-active-tool-runtime.part.js",
        "53-memory-patrol.part.js",
        "60-character-editing.part.js",
        "61-character-sessions.part.js",
        "70-import-export.part.js",
        "80-presets.part.js",
        "90-lifecycle.part.js",
        "91-page-helpers.part.js",
        "92-bindings.part.js"
];
    // 以当前脚本的真实 URL 为基准计算仓库根路径，兼容根入口和 pages 子目录入口。
    const currentScriptUrl = document.currentScript?.src || new URL('assets/js/app.js', document.baseURI).href;
    const projectRootUrl = new URL('../../', currentScriptUrl);
    const sources = [];

    // 同步读取并汇总源码，确保 Vue 在页面首次渲染前完成应用装配。
    fragments.forEach((fragment) => {
        const request = new XMLHttpRequest();
        const sourceUrl = new URL('src/app/' + fragment, projectRootUrl).href;
        request.open('GET', sourceUrl, false);
        request.send();
        if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
            throw new Error('无法加载应用片段: ' + sourceUrl);
        }
        sources.push(request.responseText + '\n//# sourceURL=' + sourceUrl);
    });

    // 所有片段共享同一词法作用域，维持拆分前的 const、函数和 Vue setup 闭包依赖。
    (0, eval)(sources.join('\n'));
})();
