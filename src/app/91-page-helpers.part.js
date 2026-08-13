// 91-page-helpers.part.js：由 build-app.js 按 setup 依赖顺序组装。
// 解析并截断生成的包含 HTML UI 的正文，避免闪屏问题
        const processMainContent = (mainText, isGeneratingState) => {
            mainText = stripUiTemplateUpdateBlock(mainText);
            if (!isGeneratingState) return { text: mainText, showSpinner: false };
            const patterns = ['```html', '```vue', '<!DOCTYPE', '<div', '<style'];
            let earliestIndex = -1;
            for (const p of patterns) {
                const idx = mainText.toLowerCase().indexOf(p);
                if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
                    earliestIndex = idx;
                }
            }
            if (earliestIndex !== -1) {
                return { text: mainText.substring(0, earliestIndex), showSpinner: true };
            }
            return { text: mainText, showSpinner: false };
        };

        const switchProfile = (id) => {
            const profile = userProfiles.value.find(p => p.uuid === id);
            if (profile) {
                activeProfileId.value = id;
                Object.assign(user, JSON.parse(JSON.stringify(profile)));
                saveData();
                showToast(`已切换为人设: ${user.name}`, 'success');
            }
        };

        const createNewProfile = () => {
            const newProfile = {
                uuid: generateUUID(),
                name: '新人设',
                description: '',
                avatar: null,
                person: 'second'
            };
            userProfiles.value.push(newProfile);
            switchProfile(newProfile.uuid);
        };



        const deleteProfile = (id) => {
            if (userProfiles.value.length <= 1) {
                showToast('无法删除唯一的人设', 'error');
                return;
            }

            confirmMessage.value = '确定要删除此人设吗？此操作不可逆。';
            confirmCallback.value = () => {
                const index = userProfiles.value.findIndex(p => p.uuid === id);
                if (index !== -1) {
                    userProfiles.value.splice(index, 1);
                    if (activeProfileId.value === id) {
                        switchProfile(userProfiles.value[0].uuid);
                    } else {
                        saveData();
                    }
                    showToast('人设已删除', 'success');
                }
                showConfirmModal.value = false;
            };
            showConfirmModal.value = true;
        };

        const activeKeepFloors = computed(() => (
            memorySettings.mode === MEMORY_MODE_CLASSIC
                ? memorySettings.summaryKeepFloors
                : memorySettings.vectorKeepFloors
        ));
        const keepFloorsSliderMin = computed(() => (
            memorySettings.mode === MEMORY_MODE_CLASSIC
                ? SUMMARY_KEEP_FLOORS_MIN
                : VECTOR_KEEP_FLOORS_MIN
        ));
        const keepFloorsSliderMax = computed(() => (
            memorySettings.mode === MEMORY_MODE_CLASSIC
                ? SUMMARY_KEEP_FLOORS_MAX
                : VECTOR_KEEP_FLOORS_MAX
        ));
        const keepFloorsSlider = computed({
            get: () => activeKeepFloors.value,
            set: (value) => {
                if (memorySettings.mode === MEMORY_MODE_CLASSIC) {
                    memorySettings.summaryKeepFloors = normalizeKeepFloors(
                        value,
                        SUMMARY_KEEP_FLOORS_MIN,
                        SUMMARY_KEEP_FLOORS_MAX,
                        SUMMARY_KEEP_FLOORS_DEFAULT
                    );
                    return;
                }
                memorySettings.vectorKeepFloors = normalizeKeepFloors(
                    value,
                    VECTOR_KEEP_FLOORS_MIN,
                    VECTOR_KEEP_FLOORS_MAX,
                    VECTOR_KEEP_FLOORS_DEFAULT
                );
            }
        });
        const getTokenUsageCategory = (type) => {
            if (['summary', 'embedding'].includes(type)) return 'memory';
            if (type === 'ui_template') return 'variables';
            return 'chat';
        };
        const tokenUsageTimeRanges = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        const filteredTokenUsageHistory = computed(() => {
            const timeRange = tokenUsageTimeRanges[tokenUsageTimeFilter.value];
            const cutoff = timeRange ? Date.now() - timeRange : 0;
            return tokenUsageHistory.value.filter(record => {
                const matchesType = tokenUsageFilter.value === 'all'
                    || getTokenUsageCategory(record.type) === tokenUsageFilter.value;
                if (!matchesType || !timeRange) return matchesType;
                const timestamp = Number(record.timestamp);
                return Number.isFinite(timestamp) && timestamp >= cutoff;
            });
        });
        const tokenUsageStats = computed(() => filteredTokenUsageHistory.value.reduce((stats, record) => {
            ['inputTokens', 'outputTokens', 'cacheReadTokens'].forEach(key => {
                if (!Number.isFinite(record[key])) return;
                stats[key] += record[key];
                stats[`${key}Reports`]++;
            });
            return stats;
        }, {
            inputTokens: 0,
            inputTokensReports: 0,
            outputTokens: 0,
            outputTokensReports: 0,
            cacheReadTokens: 0,
            cacheReadTokensReports: 0
        }));
        const tokenUsagePageCount = computed(() => Math.max(1, Math.ceil(filteredTokenUsageHistory.value.length / LIST_PAGE_SIZE)));
        const displayedTokenUsageHistory = computed(() => {
            const start = (tokenUsagePage.value - 1) * LIST_PAGE_SIZE;
            return filteredTokenUsageHistory.value.slice(start, start + LIST_PAGE_SIZE);
        });
        const classicMemoryPageCount = computed(() => Math.max(1, Math.ceil(classicMemories.value.length / LIST_PAGE_SIZE)));
        watch([tokenUsageFilter, tokenUsageTimeFilter], () => { tokenUsagePage.value = 1; });
        watch(tokenUsagePageCount, pageCount => { tokenUsagePage.value = Math.min(tokenUsagePage.value, pageCount); });
        watch(classicMemoryPageCount, pageCount => { classicMemoryPage.value = Math.min(classicMemoryPage.value, pageCount); });
        watch(() => currentCharacter.value?.uuid, () => { classicMemoryPage.value = 1; });
        const formatTokenCount = (value) => Number.isFinite(value) ? value.toLocaleString() : '0';
        const formatTokenAggregate = (value, reports) => reports > 0 && value > 0
            ? `${Number((value / 1000000).toFixed(2))}M`
            : '0';
        const formatTokenUsageTime = (timestamp) => new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
        const getTokenUsageTypeLabel = (type) => ({
            chat: '主对话',
            memory: '记忆系统',
            variables: '变量分析'
        })[getTokenUsageCategory(type)];
        const clearTokenUsageHistory = () => {
            confirmAction('确定要清空全部 Token 用量记录吗？此操作无法撤销。', async () => {
                tokenUsageHistory.value = [];
                tokenUsagePage.value = 1;
                await saveTokenUsageHistoryNow();
                showToast('Token 用量记录已清空', 'success');
            });
        };
