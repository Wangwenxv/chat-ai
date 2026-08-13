// 92-bindings.part.js：由 build-app.js 按 setup 依赖顺序组装。
return {
            switchProfile, createNewProfile, deleteProfile, userProfiles, activeProfileId, showProfileDropdown,
            processMainContent,
            currentView, navigateToPage: window.ChatAINavigation?.open, showAdvancedFeatures, showDescriptionPanel, showApiSettingsModal, showModelSelector, modelSelectionTarget, openModelSelector, showChatModelSelector, showCharacterEditor, showAddCharacterMenu, showPresetEditor, showUiTemplateEditor,
            showActiveToolEditor,
            showExportModal, sysInstruction, showInstructionPanel, exportItems, selectedExportIndices, // Export Modal
            showContextViewerModal, lastContextMessages, lastTriggeredWorldInfos, lastContextTotalLength, // Context Viewer
            tokenUsageHistory, tokenUsagePage, tokenUsagePageCount, tokenUsageFilter, tokenUsageTimeFilter,
            showTokenUsageTimeFilter, tokenUsageTimeFilterOptions, tokenUsageTimeFilterLabel,
            filteredTokenUsageHistory, tokenUsageStats, displayedTokenUsageHistory,
            formatTokenCount, formatTokenAggregate, formatTokenUsageTime, getTokenUsageTypeLabel, clearTokenUsageHistory,
            showCharacterExportModal, openCharacterExportModal, confirmCharacterExport, // Character Export Modal
            showConfirmModal, confirmMessage, modelMode, showNoMemoryNeededModal, // Export for template
            isGenerating, isRemoteGenerating, remoteEstimatedTime, isReceiving, isThinking, hasActiveToolInlineWork, isConversationBusy, activeToolContinuationMessageId, activeToolContinuationHasResponse, userInput, modelSearchQuery, activeModelTag, modelTags, characterSearchQuery, filteredModels, filteredCharacters,
            user, settings, apiProviderOptions, selectedApiProvider, isCustomApiProvider, customApiProviderOptions, showApiProviderSelector, selectApiProvider, characters, currentCharacter, currentCharacterIndex, chatHistory, currentChatSessions, currentConversationId, displayedChatMessages, handleChatScroll, presets, presetRoleOptions, fontFamilyOptions, imageStyleOptions, imageSizeOptions, imageOutputFormatOptions, imageReasoningEffortOptions, imageGenCountOptions, scopeOptions, uiTemplatePlacementOptions, worldInfoPositionOptions, getPresetRoleLabel, getPresetRoleDisplayLabel, getPresetRoleBadgeClass, regexScripts, worldInfo,
            activeTools, activeToolAggressivenessOptions: ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS, editingActiveTool, normalizeActiveTools, isWebActiveTool, getActiveToolDisplayDescription, getActiveToolResultCountMin, getActiveToolResultCountMax,
            getToolCallModeText, hasThinkingOrTools, isMessageThinkingOrRunning, isThinkingSummaryOpen, toggleThinkingSummary, markThinkingSummaryDetailOpened, getTimelineSteps,
            chatRoundStats, conversationBodyLength, summaryCompressedBodyLength,
            editingCharacter, editingPreset, editingUiTemplate, toasts, chatContainer, isChatFullscreen, isMobileKeyboardOpen, inputBox, messageElements,
            isGeneratorLoading, generatorUrl, onGeneratorLoad, // Generator exports
            isSquareLoading, squareUrl, onSquareLoad, // Square exports
            editorTab, characterDisplayLimit, displayedCharacters, loadMoreCharacters,
            isAutoImageGenEnabled, generationMode, setGenerationMode, pendingReferenceImages, referenceImageInput,
            apiStatus, apiLatency, imageGenStatus, imageGenLatency, checkAllStatuses, // Status Exports
            toggleAutoImageGen, setWorldInfoEnabled, handleReferenceImageSelection, handleChatPaste, removePendingReferenceImage,
            quotaValue, quotaLoading, quotaError,
            // Memory System Exports
            classicMemoryPage, classicMemoryPageCount, memorySettings,
            isAnyMemoryProcessing: computed(() => isBatchExtracting.value || isClassicBatchExtracting.value),
            isActiveBatchExtracting: computed(() => memorySettings.mode === MEMORY_MODE_CLASSIC ? isClassicBatchExtracting.value : isBatchExtracting.value),
            activeBatchExtractProgress: computed(() => memorySettings.mode === MEMORY_MODE_CLASSIC ? classicBatchExtractProgress.value : batchExtractProgress.value),
            vectorMemorySearchQuery, vectorMemorySearchResults, vectorMemorySearchError, vectorMemorySearchSortMode, isVectorMemorySearching,
            startBatchMemoryExtraction, abortBatchExtraction, searchVectorMemories, clearVectorMemorySearch,
            activeKeepFloors, keepFloorsSlider, keepFloorsSliderMin, keepFloorsSliderMax,
            // 滑块值映射：4-10 为变量分析消息层数。
            uiTemplateAnalysisDepthSlider: computed({
                get: () => Math.max(4, Math.min(10, Number(settings.uiTemplateAnalysisDepth) || 4)),
                set: (val) => { settings.uiTemplateAnalysisDepth = Math.max(4, Math.min(10, Number(val) || 4)); }
            }),
            displayedVectorMemorySearchResults: computed(() => {
                const result = [...vectorMemorySearchResults.value];
                if (vectorMemorySearchSortMode.value === 'score') {
                    return result.sort((a, b) => {
                        const scoreDiff = (b.vectorSearchScore || 0) - (a.vectorSearchScore || 0);
                        if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
                        const turnDiff = (a.turn || 0) - (b.turn || 0);
                        if (turnDiff !== 0) return turnDiff;
                        return (a.sequence || 0) - (b.sequence || 0);
                    });
                }
                return result.sort((a, b) => {
                    const turnDiff = (a.turn || 0) - (b.turn || 0);
                    if (turnDiff !== 0) return turnDiff;
                    return (a.sequence || 0) - (b.sequence || 0);
                });
            }),
            displayedClassicMemories: computed(() => {
                const messagesById = new Map(
                    chatHistory.value.filter(message => message?.id).map(message => [message.id, message])
                );
                const currentTurnsByAssistantId = new Map();
                const snapshot = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false });
                snapshot.turns.forEach(turnInfo => {
                    getClassicTurnSourceIds(turnInfo, 'assistant').forEach(id => currentTurnsByAssistantId.set(id, turnInfo.turn));
                });
                const getLiveLength = (ids, fallback) => {
                    const texts = (ids || [])
                        .map(id => messagesById.get(id))
                        .filter(Boolean)
                        .map(message => parseCot(message.content || '').main);
                    if (texts.length > 0) {
                        return texts.reduce((total, text) => total + text.length, 0);
                    }
                    return parseCot(fallback || '').main.length;
                };
                const sortedMemories = [...classicMemories.value]
                    .map(memory => {
                        const userChars = getLiveLength(memory.sourceUserIds, memory.sourceUserText);
                        const assistantChars = getLiveLength(memory.sourceAssistantIds, memory.sourceAssistantText);
                        const summaryChars = parseCot(memory.summary || '').main.length;
                        return {
                            ...memory,
                            displayTurn: (memory.sourceAssistantIds || []).map(id => currentTurnsByAssistantId.get(id)).find(Boolean) || memory.turn,
                            originalChars: userChars + assistantChars,
                            compressedChars: userChars + summaryChars
                        };
                    })
                    .sort((a, b) => (b.displayTurn || 0) - (a.displayTurn || 0));
                const start = (classicMemoryPage.value - 1) * LIST_PAGE_SIZE;
                return sortedMemories.slice(start, start + LIST_PAGE_SIZE);
            }),
            memoryStats: computed(() => {
                const vectorMemories = memories.value.filter(isVectorMemory);
                const vector = vectorMemories.length;
                const classic = classicMemories.value.length;
                const vectorTurns = new Set(vectorMemories.map(memory => memory.turn).filter(Boolean)).size;

                return {
                    vector,
                    vectorTurns,
                    classic,
                    activeTotal: memorySettings.mode === MEMORY_MODE_CLASSIC ? classic : vector
                };
            }),
            clearAllMemories: () => {
                const isClassicMode = memorySettings.mode === MEMORY_MODE_CLASSIC;
                const modeName = isClassicMode ? '总结模式' : '向量记忆';
                confirmAction(`确定要清空所有${modeName}吗？此操作无法撤销。`, async () => {
                    if (isClassicMode) {
                        abortClassicBatchExtraction();
                        classicMemories.value = [];
                        await saveClassicMemoriesNow();
                    } else {
                        abortVectorBatchExtraction();
                        memories.value = [];
                        await saveMemoriesNow();
                    }
                    showToast(`${modeName}已清空`, 'success');
                });
            },
            exportMemories: async () => {
                const isClassicMode = memorySettings.mode === MEMORY_MODE_CLASSIC;
                let exportData;
                if (isClassicMode) {
                    if (classicMemories.value.length === 0) { showToast('当前模式没有记忆可导出', 'info'); return; }
                    const exportedMemories = [...classicMemories.value]
                        .sort((a, b) => (a.turn || 0) - (b.turn || 0))
                        .map(memory => ({
                            turn: memory.turn,
                            user: {
                                content: memory.sourceUserText || '',
                                messageIds: memory.sourceUserIds || []
                            },
                            assistant: {
                                content: memory.sourceAssistantText || '',
                                messageIds: memory.sourceAssistantIds || []
                            },
                            summary: memory.summary
                        }));
                    exportData = {
                        type: 'rp-hub-summary-memories',
                        version: 1,
                        character: currentCharacter.value?.name || 'unknown',
                        exportedAt: new Date().toISOString(),
                        total: exportedMemories.length,
                        memories: exportedMemories
                    };
                } else {
                    exportData = await compactMemoriesForStorageAsync(memories.value);
                    if (exportData.length === 0) { showToast('当前模式没有记忆可导出', 'info'); return; }
                }
                const blob = downloadJsonFile(
                    exportData,
                    `${isClassicMode ? 'summary_memories' : 'vector_memories'}_${currentCharacter.value?.name || 'unknown'}.json`,
                    isClassicMode ? 2 : 0,
                    { revokeDelay: 1000 }
                );
                showToast(`${isClassicMode ? '总结模式' : '向量'}记忆已导出，约 ${Math.max(1, Math.round(blob.size / 1024))} KB`, 'success');
            },
            importMemories: (event) => readJsonFileInput(event, async data => {
                const isClassicMode = memorySettings.mode === MEMORY_MODE_CLASSIC;
                if (isClassicMode) {
                    if (data?.type !== 'rp-hub-summary-memories' || !Array.isArray(data.memories)) {
                        throw new Error('这不是总结模式记忆文件');
                    }
                    const normalized = prepareClassicMemoriesForRuntime(data.memories.map(memory => ({
                        id: generateUUID(),
                        timestamp: Date.now(),
                        turn: memory?.turn,
                        summary: memory?.summary,
                        enabled: true,
                        classicMemory: true,
                        sourceUserIds: Array.isArray(memory?.user?.messageIds) ? memory.user.messageIds : [],
                        sourceAssistantIds: Array.isArray(memory?.assistant?.messageIds) ? memory.assistant.messageIds : [],
                        sourceUserText: String(memory?.user?.content || ''),
                        sourceAssistantText: String(memory?.assistant?.content || '')
                    })));
                    if (normalized.length === 0) throw new Error('文件中没有有效的总结模式记忆');
                    const existingKeys = new Set(classicMemories.value.map(memory => getClassicMemoryKey(memory.sourceAssistantIds, memory.turn)));
                    const added = normalized.filter(memory => {
                        const key = getClassicMemoryKey(memory.sourceAssistantIds, memory.turn);
                        if (existingKeys.has(key)) return false;
                        existingKeys.add(key);
                        return true;
                    });
                    classicMemories.value = [...classicMemories.value, ...added];
                    await saveClassicMemoriesNow();
                    showToast(`成功导入 ${added.length} 条总结模式记忆`, 'success');
                    return;
                }

                const items = Array.isArray(data) ? data : data?.memories;
                if (!Array.isArray(items)) throw new Error('文件内容不正确');
                const normalized = items
                    .filter(m => m && m.vectorMemory === true && hasVectorEmbedding(m))
                    .map(m => {
                        const { importance, ...memoryData } = m;
                        return {
                            ...memoryData,
                            id: memoryData.id || generateUUID(),
                            timestamp: memoryData.timestamp || Date.now(),
                            turn: memoryData.turn || 0,
                            summary: String(memoryData.summary || memoryData.paragraph || '').trim(),
                            vectorMemory: true,
                            chunkMode: 'paragraph',
                            enabled: memoryData.enabled !== false
                        };
                    });
                if (normalized.length === 0) throw new Error('这不是向量记忆文件');
                memories.value = [...memories.value, ...prepareMemoriesForRuntime(normalized)];
                await saveMemoriesNow();
                showToast(`成功导入 ${normalized.length} 个分片`, 'success');
            }, error => showToast(`导入失败: ${error.message || 'JSON 格式错误'}`, 'error')),
            toggleMobileMenu, closeMobileMenu,
            fetchModels, selectModel, refreshChatModels, toggleChatModelSelector, selectChatModel, sendMessage, autoResizeInput, handleChatInputFocus, handleChatInputBlur, stopGeneration, clearChat, toggleChatFullscreen,
            handleConfirm, handleCancel, // Export handlers
            copyMessage, deleteMessage, regenerateMessage,
            editMessage, saveEditMessage, cancelEditMessage,
            createNewCharacter, editCharacter, saveCharacter, deleteCharacter, selectCharacter, toggleCharacterFavorite, isCharacterFavorite,
            createChatSession, selectChatSession, deleteChatSession, formatChatSessionTime,
            currentUiTemplates, activeUiTemplates, uiTemplateUpdateStatus, createUiTemplate, editUiTemplate, saveUiTemplate, deleteUiTemplate, importUiTemplates, updateUiTemplatesFromChat, renderEditingUiTemplatePreview, handleUiTemplateClick, formatUiTemplateChangeValue,
            isBatchDeleteMode, isSidebarCollapsed, isAdvancedNavOpen, toggleAdvancedNav, selectedCharacterIndices, toggleBatchDeleteMode, toggleCharacterSelection, batchDeleteCharacters,
            getCharacterWICount, getCharacterRegexCount,
            handleAvatarUpload, importCharacter,
            createPreset, editPreset, savePreset, deletePreset,
            renderMarkdown, messageUsesWideLayout, parseCot, closeCharacterEditor: () => showCharacterEditor.value = false,
            openExportModal: (type) => {
                exportType.value = type;
                selectedExportIndices.value.clear();

                if (type === 'presets') {
                    exportItems.value = presets.value;
                } else if (type === 'regex') {
                    exportItems.value = regexScripts.value;
                } else if (type === 'worldinfo') {
                    exportItems.value = worldInfo.value;
                } else if (type === 'uitemplates') {
                    exportItems.value = currentUiTemplates.value;
                }

                showExportModal.value = true;
            },
            toggleExportSelection: (index) => {
                if (selectedExportIndices.value.has(index)) {
                    selectedExportIndices.value.delete(index);
                } else {
                    selectedExportIndices.value.add(index);
                }
            },
            selectAllExportItems: () => {
                exportItems.value.forEach((_, index) => selectedExportIndices.value.add(index));
            },
            deselectAllExportItems: () => {
                selectedExportIndices.value.clear();
            },
            confirmExport: () => {
                const indices = Array.from(selectedExportIndices.value).sort((a, b) => a - b);
                const items = indices.map(i => exportItems.value[i]);

                if (items.length === 0) return;

                let fileName = 'export.json';
                let dataToExport = items;

                if (exportType.value === 'presets') {
                    fileName = 'presets.json';
                    // Presets are exported as a direct array of objects
                } else if (exportType.value === 'regex') {
                    fileName = 'regex_scripts.json';
                    dataToExport = items.map(script => toRegexExportEntry(script));
                } else if (exportType.value === 'worldinfo') {
                    fileName = 'world_info.json';
                    // World Info should be wrapped in entries object
                    dataToExport = { entries: items.map(toWorldInfoExportEntry) };
                } else if (exportType.value === 'uitemplates') {
                    fileName = `${currentCharacter.value?.name || 'global'}_ui_templates.json`;
                    dataToExport = {
                        type: 'rp-hub-ui-templates',
                        templates: items.map(toUiTemplateExportEntry)
                    };
                }

                downloadJsonFile(dataToExport, fileName);

                showExportModal.value = false;
                showToast(`成功导出 ${items.length} 个项目`, 'success');
            },
            importPresets: (event) => readJsonFileInput(event, data => {
                const items = Array.isArray(data) ? data : [data];
                if (items.length > 0) {
                    presets.value = [...presets.value, ...items.map(normalizePreset)];
                    showToast(`成功导入 ${items.length} 条预设`, 'success');
                }
            }, () => showToast('导入失败: 格式错误', 'error')),

            // Regex Methods
            importRegex: (event) => readJsonFileInput(event, data => {
                const items = Array.isArray(data) ? data : [data];
                const normalized = items.map(script => {
                    const s = { ...script };
                    s.scope = s.scope || (currentCharacter.value ? 'character' : 'global');
                    if (s.disabled !== undefined) {
                        s.enabled = !s.disabled;
                    } else if (s.enabled === undefined) {
                        s.enabled = true;
                    }
                    if (!s.name && s.scriptName) s.name = s.scriptName;
                    if (!s.regex && s.findRegex) s.regex = s.findRegex;

                    if (s.regex && s.regex.startsWith('/') && s.regex.lastIndexOf('/') > 0) {
                        const lastSlash = s.regex.lastIndexOf('/');
                        const potentialFlags = s.regex.substring(lastSlash + 1);
                        if (/^[gimsuy]*$/.test(potentialFlags)) {
                            s.flags = potentialFlags;
                            s.regex = s.regex.substring(1, lastSlash);
                        }
                    }

                    if (!s.replacement && s.replaceString) s.replacement = s.replaceString;
                    if (!s.flags && s.regexFlags) s.flags = s.regexFlags;
                    if (!s.flags) s.flags = 'g';
                    if (!s.placement) s.placement = [1, 2];
                    if (s.markdownOnly === undefined) s.markdownOnly = false;
                    if (s.promptOnly === undefined) s.promptOnly = false;
                    if (s.runOnEdit === undefined) s.runOnEdit = false;
                    if (s.minDepth === undefined) s.minDepth = null;
                    if (s.maxDepth === undefined) s.maxDepth = null;

                    return normalizeRegexScript(s, s.scope);
                });

                regexScripts.value = [...regexScripts.value, ...normalized];
                showToast(`成功导入 ${normalized.length} 个正则脚本`, 'success');
            }, error => showToast(`导入失败: ${error.message}`, 'error')),
            createRegex: () => {
                editingRegex.id = undefined;
                editingRegex.data = {
                    name: 'New Script',
                    regex: '',
                    flags: 'g',
                    replacement: '',
                    placement: [1, 2],
                    scope: currentCharacter.value ? 'character' : 'global',
                    markdownOnly: false,
                    promptOnly: false,
                    runOnEdit: false,
                    minDepth: null,
                    maxDepth: null
                };
                showRegexEditor.value = true;
            },
            editRegex: (index) => {
                editingRegex.id = index;
                editingRegex.data = normalizeRegexScript({ ...regexScripts.value[index] });
                showRegexEditor.value = true;
            },
            saveRegex: () => {
                const data = normalizeRegexScript(editingRegex.data, editingRegex.data.scope);
                if (editingRegex.id !== undefined) {
                    regexScripts.value[editingRegex.id] = data;
                } else {
                    regexScripts.value.push(data);
                }
                showRegexEditor.value = false;
            },
            deleteRegex: (index) => {
                confirmAction('确定要删除这个正则脚本吗？此操作无法撤销。', () => {
                    regexScripts.value.splice(index, 1);
                    showToast('正则脚本已删除', 'success');
                });
            },

            editActiveTool: (index) => {
                const tool = activeTools.value[index];
                if (!tool) return;
                editingActiveTool.id = index;
                editingActiveTool.data = normalizeActiveTool(JSON.parse(JSON.stringify(tool)));
                showActiveToolEditor.value = true;
            },
            saveActiveTool: () => {
                const index = editingActiveTool.id;
                if (index === undefined || !activeTools.value[index]) {
                    showActiveToolEditor.value = false;
                    return;
                }
                const previous = activeTools.value[index];
                const data = normalizeActiveTool({
                    ...previous,
                    id: previous.id,
                    name: previous.name,
                    enabled: previous.enabled,
                    callName: previous.callName,
                    type: previous.type,
                    description: previous.description,
                    displayDescription: previous.displayDescription,
                    resultCount: editingActiveTool.data.resultCount,
                    resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
                    tavilyApiKey: editingActiveTool.data.tavilyApiKey
                });
                activeTools.value[index] = data;
                normalizeActiveTools();
                showActiveToolEditor.value = false;
                showToast('工具设置已保存', 'success');
            },

            // World Info Methods
            importWorldInfo: (event) => readJsonFileInput(event, data => {
                let entries = [];
                if (Array.isArray(data)) {
                    entries = data;
                } else if (Array.isArray(data?.entries)) {
                    entries = data.entries;
                } else if (data?.entries && typeof data.entries === 'object') {
                    entries = Object.values(data.entries);
                }
                if (entries.length > 0) {
                    const normalizedEntries = entries.map(normalizeWorldInfoEntry);
                    worldInfo.value = [...worldInfo.value, ...normalizedEntries];
                    if (currentCharacterIndex.value !== -1) {
                        characters.value[currentCharacterIndex.value].worldInfo = JSON.parse(JSON.stringify(worldInfo.value));
                    }
                    showToast('世界书导入成功', 'success');
                }
            }, () => showToast('导入失败: 格式错误', 'error')),
            createWorldInfo: () => {
                editingWorldInfo.id = undefined;
                editingWorldInfo.data = {
                    // Basic
                    comment: '',
                    keys: [],
                    content: '',
                    enabled: true,
                    scope: currentCharacter.value ? 'character' : 'global',

                    // Position & Order
                    position: 'global_note',
                    depth: 4,
                    order: 100,

                    // Matching Strategy
                    useRegex: false,
                    scanDepth: 2,
                    probability: 100,
                    useProbability: true,

                    constant: false
                };
                setWorldInfoKeysText(editingWorldInfo.data.keys);
                showWorldInfoEditor.value = true;
            },
            editWorldInfo: (index) => {
                editingWorldInfo.id = index;
                const data = JSON.parse(JSON.stringify(worldInfo.value[index]));
                // Ensure defaults
                if (!data.position) data.position = 'at_depth';
                if (data.depth === undefined) data.depth = 4;
                if (data.order === undefined) data.order = 100;
                if (data.probability === undefined) data.probability = 100;
                if (data.useProbability === undefined) data.useProbability = true;
                if (!data.comment) data.comment = '';
                if (!data.scope) data.scope = 'character';

                // New fields defaults
                if (data.useRegex === undefined) data.useRegex = false;
                if (data.scanDepth === undefined) data.scanDepth = 2;
                if (data.constant === undefined) data.constant = false;

                editingWorldInfo.data = normalizeWorldInfoEntry(data);
                setWorldInfoKeysText(editingWorldInfo.data.keys);
                showWorldInfoEditor.value = true;
            },
            saveWorldInfo: () => {
                editingWorldInfo.data.keys = parseWorldInfoKeysText(worldInfoKeysText.value, editingWorldInfo.data.useRegex);
                const data = normalizeWorldInfoEntry(editingWorldInfo.data);
                if (editingWorldInfo.id !== undefined) {
                    worldInfo.value[editingWorldInfo.id] = data;
                } else {
                    worldInfo.value.push(data);
                }
                // Sync back to current character
                if (currentCharacterIndex.value !== -1) {
                    characters.value[currentCharacterIndex.value].worldInfo = JSON.parse(JSON.stringify(worldInfo.value));
                }
                showWorldInfoEditor.value = false;

            },
            deleteWorldInfo: (index) => {
                confirmAction('确定要删除这个世界书条目吗？此操作无法撤销。', () => {
                    worldInfo.value.splice(index, 1);
                    if (currentCharacterIndex.value !== -1) {
                        characters.value[currentCharacterIndex.value].worldInfo = JSON.parse(JSON.stringify(worldInfo.value));
                    }
                    showToast('世界书条目已删除', 'success');
                });
            },

            showRegexEditor, showWorldInfoEditor, editingRegex, editingWorldInfo, worldInfoKeysText, updateEditingWorldInfoKeys,
            worldInfoSettings, showWorldInfoSettings, showMemorySettings, settingsHelpTopic, showActiveToolSettings, showUiTemplateSettings, estimatedGenerationTime, currentWaitTime,
            globalConfirmModal,
            togglePlacement: (val) => {
                if (!editingRegex.data.placement) editingRegex.data.placement = [];
                const index = editingRegex.data.placement.indexOf(val);
                if (index === -1) {
                    editingRegex.data.placement.push(val);
                } else {
                    editingRegex.data.placement.splice(index, 1);
                }
            },

            // User Setup Method
            showUserSetupModal, tempUserSetup,
            handleUserAvatarUpload: (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            user.avatar = await compressImage(e.target.result, 200, 0.6);
                        } catch (err) {
                            user.avatar = e.target.result;
                        }
                        saveData();
                    };
                    reader.readAsDataURL(file);
                }
            },
            saveUserSetup: () => {
                if (!tempUserSetup.name || tempUserSetup.name === '请前往设置自定义你的名称') {
                    showToast('请输入有效的名称', 'error');
                    return;
                }
                user.name = tempUserSetup.name;
                user.person = tempUserSetup.person; // 保存偏好

                // 应用人称选择到预设
                const secondPersonPreset = presets.value.find(p => p.name === '第二人称');
                const thirdPersonPreset = presets.value.find(p => p.name === '第三人称');

                if (user.person === 'second') {
                    if (secondPersonPreset) secondPersonPreset.enabled = true;
                    if (thirdPersonPreset) thirdPersonPreset.enabled = false;
                } else {
                    if (secondPersonPreset) secondPersonPreset.enabled = false;
                    if (thirdPersonPreset) thirdPersonPreset.enabled = true;
                }

                showUserSetupModal.value = false;
                saveData();
                showToast('用户信息已保存', 'success');
            },

            // Person Toggle Logic
            isSecondPerson: computed(() => user.person !== 'third'),
            togglePerson: (person) => {
                user.person = person; // 更新偏好

                // 应用到预设
                const secondPersonPreset = presets.value.find(p => p.name === '第二人称');
                const thirdPersonPreset = presets.value.find(p => p.name === '第三人称');

                if (person === 'second') {
                    if (secondPersonPreset) secondPersonPreset.enabled = true;
                    if (thirdPersonPreset) thirdPersonPreset.enabled = false;
                    showToast('已切换至第二人称视角', 'success');
                } else {
                    if (secondPersonPreset) secondPersonPreset.enabled = false;
                    if (thirdPersonPreset) thirdPersonPreset.enabled = true;
                    showToast('已切换至第三人称视角', 'success');
                }
                saveData();
            },

            // Auto Image Gen Inquiry
            showAutoImageGenModal,

            setAutoImageGen: (enabled) => {
                const autoImageGenWIName = '自动生图';
                const entry = worldInfo.value.find(w => w.comment === autoImageGenWIName);
                if (entry) {
                    entry.enabled = enabled;
                    showToast(enabled ? '自动生图已开启' : '已保持关闭状态', enabled ? 'success' : 'info');
                }
                showAutoImageGenModal.value = false;
                saveData();
            }
        };
    }
}).mount('#app');
