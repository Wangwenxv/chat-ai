// 70-import-export.part.js：由 build-app.js 按 setup 依赖顺序组装。
// Import/Export Logic

        const toWorldInfoExportEntry = (entry) => {
            const normalized = normalizeWorldInfoEntry(entry);
            return cardUtils.toWorldInfoExportEntry(normalized);
        };

        const normalizeCharacterUiTemplates = (char) => {
            char.uiTemplates = Array.isArray(char.uiTemplates)
                ? char.uiTemplates.map(template => normalizeUiTemplate({ ...template, scope: 'character' }))
                : [];
        };

        const getCombinedWorldInfo = (char) => {
            const characterEntries = Array.isArray(char.worldInfo)
                ? JSON.parse(JSON.stringify(char.worldInfo))
                    .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                    .filter(entry => entry.scope !== 'global')
                : [];
            return [
                ...JSON.parse(JSON.stringify(globalWorldInfo.value))
                    .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'global' })),
                ...characterEntries
            ];
        };

        const parseWorldInfoKeysText = (text, preserveRegex = false) => {
            const rawText = String(text || '');
            if (!preserveRegex) {
                return rawText.split(/[,，]/)
                    .map(key => key.trim())
                    .filter(Boolean);
            }

            const parts = [];
            let current = '';
            let inRegex = false;
            let inClass = false;
            let escaped = false;

            for (const char of rawText) {
                if (escaped) {
                    current += char;
                    escaped = false;
                    continue;
                }
                if (inRegex) {
                    current += char;
                    if (char === '\\') {
                        escaped = true;
                    } else if (char === '[') {
                        inClass = true;
                    } else if (char === ']') {
                        inClass = false;
                    } else if (char === '/' && !inClass) {
                        inRegex = false;
                    }
                    continue;
                }
                if (char === ',' || char === '，') {
                    parts.push(current);
                    current = '';
                    continue;
                }
                if (char === '/' && !current.trim()) {
                    inRegex = true;
                }
                current += char;
            }
            parts.push(current);

            return parts
                .map(key => key.trim())
                .filter(Boolean);
        };

        const setWorldInfoKeysText = (keys = []) => {
            worldInfoKeysText.value = (Array.isArray(keys) ? keys : [])
                .map(key => String(key || '').trim())
                .filter(Boolean)
                .join(', ');
        };

        const updateEditingWorldInfoKeys = (text) => {
            worldInfoKeysText.value = String(text || '');
            editingWorldInfo.data.keys = parseWorldInfoKeysText(worldInfoKeysText.value, editingWorldInfo.data.useRegex);
        };

        const importCharacter = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            showAddCharacterMenu.value = false;

            // Reset file input
            event.target.value = '';

            const processCharacterData = async (rawData, avatarUrl) => {
                try {
                    // 角色卡字段兼容和标准化由独立 parser 完成，事件层只负责加入列表和切换。
                    const char = parseCharacterCard(rawData, avatarUrl, {
                        defaultAvatar,
                        generateUUID,
                        normalizeRegexScript,
                        normalizeUiTemplate,
                        sanitizeUiTemplateImportEntry
                    });

                    characters.value.push(char);

                    // Auto-select the new character and enter chat immediately.
                    const newCharacterIndex = characters.value.length - 1;
                    showAddCharacterMenu.value = false;
                    await selectCharacter(newCharacterIndex, true);

                } catch (err) {
                    console.error("Character processing error:", err);
                    showToast('解析角色数据失败: ' + err.message, 'error');
                }
            };

            if (file.type === 'application/json') {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        await processCharacterData(data, null);
                    } catch (err) {
                        showToast('JSON解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const buffer = e.target.result;
                        const { data } = cardUtils.parsePngCharacterData(buffer);
                        const blob = new Blob([buffer], { type: 'image/png' });
                        const avatarUrl = await cardUtils.blobToDataUrl(blob);
                        await processCharacterData(data, avatarUrl);
                    } catch (err) {
                        if (err.chunks) console.warn("Available chunks:", Object.keys(err.chunks));
                        console.error(err);
                        showToast('PNG解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (file.name.endsWith('.jsonl')) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const text = e.target.result;
                        const lines = text.split('\n').filter(line => line.trim() !== '');
                        const importedChat = lines.map(line => JSON.parse(line));

                        if (importedChat.length > 0) {
                            if (currentCharacterIndex.value >= 0) {
                                const char = characters.value[currentCharacterIndex.value];
                                if (!char.uuid) {
                                    char.uuid = generateUUID();
                                    await setStoredValue('characters', characters.value);
                                }
                                if (!currentConversationId.value) {
                                    ensureCurrentChatSession(char, importedChat);
                                }
                                resetChatRenderWindow();
                                chatHistory.value = prepareLoadedChatHistoryForDisplay(importedChat);
                                await saveChatHistoryNow();
                                await scrollChatToBottom();

                                showToast(`成功为 ${char.name} 导入 ${importedChat.length} 条聊天记录`, 'success');
                            } else {
                                showToast('请先选择一个角色才能导入聊天记录', 'warning');
                            }
                        } else {
                            showToast('文件中没有有效的聊天记录', 'warning');
                        }
                    } catch (err) {
                        console.error('Chat import error:', err);
                        showToast('聊天记录解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            } else {
                showToast('不支持的文件格式', 'error');
            }
        };

        const buildCharacterExportData = (char) => cardUtils.buildCharacterCardData(char, {
            worldInfoMapper: (entry) => toWorldInfoExportEntry({ ...entry, scope: 'character' }),
            uiTemplateMapper: (template) => toUiTemplateExportEntry({ ...template, scope: 'character' }),
            regexScriptMapper: (script) => toRegexExportEntry({ ...script, scope: 'character' }, 'character')
        });

        const exportCharacterJson = (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                const v2Data = buildCharacterExportData(char);
                const blob = new Blob([JSON.stringify(v2Data, null, 2)], { type: 'application/json' });
                cardUtils.downloadBlob(blob, (char.name || 'character') + '.json');
                showToast('角色卡 JSON 导出成功', 'success');
            } catch (e) {
                console.error('JSON export error:', e);
                showToast('JSON 导出失败: ' + e.message, 'error');
            }
        };

        const exportCharacterChat = async (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                if (currentCharacterIndex.value === index) {
                    await flushPendingChatHistorySave();
                }
                let sessionId = currentCharacterIndex.value === index ? currentConversationId.value : null;
                if (!sessionId && char.uuid) {
                    const state = await loadChatSessionsStateForCharacter(char, index);
                    sessionId = state.activeId;
                }
                const savedChat = await loadStoredChatHistory(char, index, sessionId);

                if (savedChat && Array.isArray(savedChat) && savedChat.length > 0) {
                    const chatLines = savedChat.map(msg => JSON.stringify(msg)).join('\n');
                    const chatBlob = new Blob([chatLines], { type: 'application/json lines' });
                    cardUtils.downloadBlob(chatBlob, (char.name || 'character') + '_chat.jsonl');
                    showToast('聊天记录导出成功', 'success');
                } else {
                    showToast('当前角色没有可导出的聊天记录', 'warning');
                }
            } catch (chatExpError) {
                console.error('Chat export error:', chatExpError);
                showToast('聊天记录导出失败', 'error');
            }
        };

        const exportCharacterPng = async (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                const v2Data = buildCharacterExportData(char);
                const pngBytes = await cardUtils.imageUrlToPngBytes(char.avatar, { crossOrigin: "Anonymous" });
                const finalPng = cardUtils.injectPngTextChunk(
                    pngBytes,
                    'chara',
                    cardUtils.encodeBase64Utf8(JSON.stringify(v2Data))
                );
                cardUtils.downloadBlob(new Blob([finalPng], { type: 'image/png' }), (char.name || 'character') + '.png');
                showToast('角色卡 PNG 导出成功', 'success');
            } catch (e) {
                console.error('PNG export error:', e);
                showToast('PNG 导出失败: ' + e.message, 'error');
            }
        };
