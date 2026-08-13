// 23-persistence-watchers.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Debounce function
        const debounce = (fn, delay) => {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => fn(...args), delay);
            };
        };

        // Debounced Save
        const debouncedSave = debounce(() => {
            saveData({ saveMemories: false });
        }, 1000);

        // Watch for changes to auto-save
        watch([characters, settings, presets, regexScripts, globalRegexScripts, worldInfo, globalWorldInfo, globalUiTemplates, activeTools, user, recentGenerationTimes], () => {
            debouncedSave();
        }, { deep: true });

        // Watch chat history length only so large histories do not get traversed on load.
        // Message edits and generation completion still call saveData/saveChatHistoryNow directly.
        watch(() => chatHistory.value.length, () => {
            if (_isApplyingCharacterScopedData) return;
            scheduleChatHistorySave();
        });
