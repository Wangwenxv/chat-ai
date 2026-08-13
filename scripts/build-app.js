const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fragmentDir = path.join(root, 'src', 'app');
const outputFile = path.join(root, 'assets', 'js', 'app.js');

// 读取按依赖顺序命名的业务片段，生成轻量加载器而不是再次拼回单体文件。
const fragments = fs.readdirSync(fragmentDir)
    .filter(file => file.endsWith('.part.js'))
    .sort();

if (fragments.length === 0) throw new Error('没有找到 app 运行时片段');

// 将所有片段作为同一次 eval 执行，保留原 setup 闭包跨片段共享变量的语义。
const loader = `(function loadChatAiApplication() {
    'use strict';

    // 固定清单由构建时生成，浏览器只按顺序读取，不需要扫描目录。
    const fragments = ${JSON.stringify(fragments, null, 8)};
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
        sources.push(request.responseText + '\\n//# sourceURL=' + sourceUrl);
    });

    // 所有片段共享同一词法作用域，维持拆分前的 const、函数和 Vue setup 闭包依赖。
    (0, eval)(sources.join('\\n'));
})();
`;

fs.writeFileSync(outputFile, loader, 'utf8');
console.log(`built lightweight ${path.relative(root, outputFile)} for ${fragments.length} app fragments`);
