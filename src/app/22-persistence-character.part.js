// 22-persistence-character.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Watch user name to update default regex
        watch(() => user.name, (newName) => {
            if (SIMPLE_CHAT_AI_MODE) return;
            const script = regexScripts.value.find(item => item.name === DEFAULT_USER_REGEX_NAME);
            if (script) {
                script.replacement = newName;
                script.scope = 'global';
            }
        });

        // Sync World Info and Regex to Current Character
        watch(worldInfo, (newVal) => {
            const normalized = JSON.parse(JSON.stringify(newVal)).map(normalizeWorldInfoEntry);
            const globalEntries = normalized.filter(entry => entry.scope === 'global');
            if (JSON.stringify(globalWorldInfo.value) !== JSON.stringify(globalEntries)) {
                globalWorldInfo.value = globalEntries;
            }
            if (currentCharacterIndex.value !== -1 && characters.value[currentCharacterIndex.value]) {
                if (_isApplyingCharacterScopedData) return;
                // Only update if different to avoid infinite loops or unnecessary updates
                const char = characters.value[currentCharacterIndex.value];
                const characterEntries = normalized.filter(entry => entry.scope !== 'global');
                if (JSON.stringify(char.worldInfo) !== JSON.stringify(characterEntries)) {
                    char.worldInfo = characterEntries;
                }
            }
        }, { deep: true });

        watch(regexScripts, (newVal) => {
            const normalized = JSON.parse(JSON.stringify(newVal)).map(script => normalizeRegexScript(script));
            const globalScripts = normalized.filter(script => script.scope === 'global');
            if (JSON.stringify(globalRegexScripts.value) !== JSON.stringify(globalScripts)) {
                globalRegexScripts.value = globalScripts;
            }
            if (currentCharacterIndex.value !== -1 && characters.value[currentCharacterIndex.value]) {
                if (_isApplyingCharacterScopedData) return;
                const char = characters.value[currentCharacterIndex.value];
                const characterScripts = normalized.filter(script => script.scope !== 'global');
                if (JSON.stringify(char.regexScripts) !== JSON.stringify(characterScripts)) {
                    char.regexScripts = characterScripts;
                }
            }
        }, { deep: true });

        watch(recentGenerationTimes, (newVal) => {
            if (currentCharacterIndex.value !== -1 && characters.value[currentCharacterIndex.value]) {
                const char = characters.value[currentCharacterIndex.value];
                if (JSON.stringify(char.recentGenerationTimes) !== JSON.stringify(newVal)) {
                    char.recentGenerationTimes = JSON.parse(JSON.stringify(newVal));
                }
            }
        }, { deep: true });

        // Auto Image Gen & Stream Linkage
        const isAutoImageGenEnabled = computed({
            get: () => {
                const entry = worldInfo.value.find(w => w.comment === '自动生图');
                return entry ? entry.enabled : false;
            },
            set: (val) => {
                const entry = worldInfo.value.find(w => w.comment === '自动生图');
                if (entry) {
                    entry.enabled = val;
                } else {
                    showToast('未找到“自动生图”世界书条目，请确认配置', 'warning');
                }
            }
        });

        const showAutoImageGenToggleToast = (enabled) => {
            showToast(enabled ? '自动生图已开启' : '自动生图已关闭', enabled ? 'success' : 'info');
        };

        const setAutoImageGenEnabled = (enabled) => {
            isAutoImageGenEnabled.value = enabled;
            const changed = isAutoImageGenEnabled.value === enabled;
            if (changed) showAutoImageGenToggleToast(enabled);
            return changed;
        };

        const toggleAutoImageGen = () => {
            setAutoImageGenEnabled(!isAutoImageGenEnabled.value);
        };

        const setWorldInfoEnabled = (entry, enabled, event) => {
            if (entry?.comment === '自动生图') {
                const changed = setAutoImageGenEnabled(enabled);
                if (!changed && event?.target) event.target.checked = isAutoImageGenEnabled.value;
                return;
            }

            if (entry) entry.enabled = enabled;
        };

        const updateImageGenRegexState = ({ enableRegex = false } = {}) => {
            if (SIMPLE_CHAT_AI_MODE) return [];
            const imageGenRegexName = 'NAI画图正则';
            let regex = regexScripts.value.find(r => r.name === imageGenRegexName);
            if (!regex) {
                enforceSpecialRules();
                regex = regexScripts.value.find(r => r.name === imageGenRegexName);
                if (!regex) return [];
            }

            const targetArtists = cardUtils.getImageStyleArtists(settings.imageStyle, settings.customImageArtists);
            const styleName = imageStyleOptions.find(option => option.value === settings.imageStyle)?.label
                || imageStyleOptions[0].label;

            // 动态替换 URL 中的 artist 和 size 参数
            const encodedTargetArtists = encodeURIComponent(targetArtists);
            const oldReplacement = regex.replacement;
            let newReplacement = oldReplacement.replace(/artist=[\s\S]*?(&size=)/, 'artist=' + encodedTargetArtists + '$1');
            if (newReplacement === oldReplacement) {
                newReplacement = oldReplacement.replace(/artist=[^&]+/, 'artist=' + encodedTargetArtists);
            }
            newReplacement = newReplacement.replace(/size=[^&]+/, 'size=' + settings.imageSize);
            regex.replacement = newReplacement;

            let messages = [];
            // 检查 Artist 变化
            const oldArtist = oldReplacement.match(/artist=([\s\S]*?)&size=/)?.[1] || oldReplacement.match(/artist=([^&]+)/)?.[1];
            if (oldArtist !== encodedTargetArtists) {
                messages.push(styleName);
            }
            // 检查 Size 变化
            const oldSize = oldReplacement.match(/size=([^&]+)/)?.[1];
            if (oldSize !== settings.imageSize) {
                messages.push(`比例: ${settings.imageSize}`);
            }

            if (enableRegex && !regex.enabled) {
                regex.enabled = true;
                messages.push(`${imageGenRegexName} 已启用`);
            }

            return messages;
        };

        watch(isAutoImageGenEnabled, (newVal) => {
            if (newVal) {
                let messages = [];
                const regexMessages = updateImageGenRegexState({ enableRegex: true });
                if (regexMessages && regexMessages.length > 0) {
                    messages.push(...regexMessages);
                }

                if (messages.length > 0) {
                    showToast('为适配生图：' + messages.join('，'), 'info');
                }
            }
        });

        watch(() => settings.imageStyle, () => {
            const messages = updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            if (isAutoImageGenEnabled.value && messages && messages.length > 0) {
                showToast('生图风格已切换：' + messages.join('，'), 'success');
            }
        });

        watch(() => settings.customImageArtists, () => {
            if (settings.imageStyle === 'custom') {
                updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            }
        });

        watch(() => settings.imageSize, () => {
            const messages = updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            if (isAutoImageGenEnabled.value && messages && messages.length > 0) {
                showToast('生图比例已切换：' + messages.join('，'), 'success');
            }
        });

        watch(() => settings.imageGenCount, () => {
            enforceSpecialRules();
        });

        const isDesktopSidebarViewport = () => window.matchMedia('(min-width: 768px)').matches;
        watch(() => settings.immersiveMode, (enabled) => {
            if (!isDesktopSidebarViewport()) return;
            isSidebarCollapsed.value = !!enabled;
        });
