(function initializeChatAIComponents(global) {
    'use strict';

    // 展示 UI 模板分析的等待状态，不持有任何应用业务状态。
    const UiTemplatePending = {
        template: `
            <div class="ui-template-pending-card" role="status" aria-live="polite">
                <div class="ui-template-pending-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5">
                        </path>
                    </svg>
                    <span class="live-dots"><i></i><i></i><i></i></span>
                </div>
                <div class="ui-template-pending-content">
                    <div class="ui-template-pending-row">
                        <span class="ui-template-pending-title">分析中</span>
                    </div>
                </div>
            </div>`
    };

    // 统一承载项目内嵌页面的加载态和移动端返回入口。
    const EmbeddedViewContent = {
        props: {
            src: String,
            loading: Boolean,
            loadingText: String
        },
        emits: ['load', 'menu'],
        template: `
            <button @click="$emit('menu')"
                class="md:hidden absolute left-0 top-1/2 transform -translate-y-1/2 z-20 pl-2 pr-1.5 py-3 bg-white/90 backdrop-blur-md text-gray-600 text-xs font-medium rounded-r-xl shadow-lg border border-l-0 border-gray-200 active:scale-95 transition-all flex flex-col items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                <span class="leading-none">返</span>
                <span class="leading-none">回</span>
            </button>
            <div class="flex-1 w-full relative bg-white h-full">
                <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
                    <div class="flex flex-col items-center">
                        <svg class="embedded-loading-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle class="embedded-loading-spinner__track" cx="12" cy="12" r="9"></circle>
                            <circle class="embedded-loading-spinner__arc" cx="12" cy="12" r="9"></circle>
                        </svg>
                        <div class="text-gray-500 font-medium">{{ loadingText }}</div>
                    </div>
                </div>
                <iframe :src="src" @load="$emit('load')" class="absolute inset-0 w-full h-full border-0"
                    allow="clipboard-write"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe>
            </div>`
    };

    // 独立渲染生成耗时，避免计时展示细节混入聊天业务逻辑。
    const GenerationTimer = {
        props: {
            waitTime: Number,
            estimatedTime: Number,
            remoteEstimatedTime: Number,
            remote: Boolean
        },
        template: `
            <div class="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono bg-white/50 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/50 animate-fade-in mt-1 shadow-sm typing-timer-badge">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="whitespace-nowrap">
                    {{ waitTime }}s
                    <span v-if="estimatedTime || remoteEstimatedTime" class="text-gray-300 mx-0.5">/</span>
                    <span v-if="estimatedTime && !remote">{{ estimatedTime }}s</span>
                    <span v-else-if="remoteEstimatedTime">{{ remoteEstimatedTime }}s</span>
                </span>
            </div>`
    };

    // 为旧设置页面保留统一标题布局，组件本身只负责插槽和菜单事件。
    const SettingsPageHeader = {
        props: { title: String },
        emits: ['menu'],
        template: `
            <div class="settings-page-header">
                <div class="flex items-center">
                    <button @click="$emit('menu')" class="mobile-menu-button">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
                    </button>
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
                        <slot name="icon"></slot>
                        {{ title }}
                        <slot name="title-extra"></slot>
                    </h2>
                </div>
                <div v-if="$slots.default" class="flex space-x-2 md:space-x-3">
                    <slot></slot>
                </div>
            </div>`
    };

    // 组件通过一个命名空间注册，app.js 只负责装配。
    global.ChatAIComponents = {
        UiTemplatePending,
        EmbeddedViewContent,
        GenerationTimer,
        SettingsPageHeader
    };
})(window);
