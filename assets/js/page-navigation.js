(function initializeChatAINavigation(global) {
    'use strict';

    // 侧边栏页面统一使用真实 HTML 入口，避免在一个 Vue 根节点里切换整页视图。
    const pageNames = Object.freeze({
        chat: '聊天',
        usage: '用量统计',
        memory: '记忆系统',
        uitemplates: 'UI模板',
        characters: '角色卡管理',
        generator: '角色卡生成',
        square: '万相广场',
        presets: '预设',
        worldinfo: '世界书',
        regex: '正则',
        tools: '工具',
        settings: '设置'
    });

    // 从当前路径推断页面名；根入口始终作为聊天页处理。
    const currentPage = (() => {
        const match = String(global.location?.pathname || '').match(/\/pages\/([^/]+)\.html$/i);
        const page = match ? match[1].toLowerCase() : 'chat';
        return Object.prototype.hasOwnProperty.call(pageNames, page) ? page : 'chat';
    })();

    // 生成稳定的页面地址，供任意入口跳转到其他独立 HTML 文件。
    // 根据当前文档的 base 地址生成目标入口，确保根入口和 pages 子目录都能正确跳转。
    const pageUrl = (page) => {
        const target = `pages/${Object.prototype.hasOwnProperty.call(pageNames, page) ? page : 'chat'}.html`;
        return new URL(target, global.document?.baseURI || global.location.href).href;
    };
    const open = (page) => {
        global.location.href = pageUrl(page);
    };

    // 角色卡生成器等嵌入资源统一从站点根目录解析，避免多入口相对路径错误。
    // 统一把资源路径解析到站点根目录，供嵌入式页面使用。
    const assetUrl = (relativePath) => new URL(
        String(relativePath || '').replace(/^\.\//, ''),
        global.document?.baseURI || global.location.href
    ).href;

    global.ChatAINavigation = Object.freeze({
        currentPage,
        pageNames,
        pageUrl,
        open,
        assetUrl
    });
})(window);
