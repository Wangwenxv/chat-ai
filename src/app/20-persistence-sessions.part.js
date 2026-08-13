// 20-persistence-sessions.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- Persistence and conversation sessions ---
        const getActiveConversationMemoryScopeId = (characterId = currentCharacter.value?.uuid) => (
            getConversationStorageScopeId(characterId, currentConversationId.value)
        );

        const getChatSessionStatePayload = (activeId = currentConversationId.value, sessions = chatSessions.value) => ({
            activeId,
            sessions: sortChatSessions(sessions)
        });

        const setChatSessionsStateForCharacterId = async (characterId, state) => {
            if (!characterId) return false;
            await setScopedStoredValue('chat_sessions', characterId, cloneForStorage(state), { clone: false });
            return true;
        };

        const saveCurrentChatSessionsState = (characterId = currentCharacter.value?.uuid) => (
            setChatSessionsStateForCharacterId(characterId, getChatSessionStatePayload())
        );

        const upsertCurrentChatSessionMeta = (sessionMeta) => {
            if (!sessionMeta?.id) return;
            const existingIndex = chatSessions.value.findIndex(session => session.id === sessionMeta.id);
            if (existingIndex >= 0) {
                chatSessions.value[existingIndex] = sessionMeta;
            } else {
                chatSessions.value.unshift(sessionMeta);
            }
            chatSessions.value = sortChatSessions(chatSessions.value);
        };

        const ensureCurrentChatSession = (char = currentCharacter.value, messages = chatHistory.value) => {
            if (!char?.uuid) return null;
            let sessionId = currentConversationId.value;
            let session = chatSessions.value.find(item => item.id === sessionId);
            if (!session) {
                session = {
                    id: generateUUID(),
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                sessionId = session.id;
                currentConversationId.value = sessionId;
            }
            upsertCurrentChatSessionMeta(buildChatSessionMeta({
                ...session,
                updatedAt: Date.now()
            }, messages, char));
            return sessionId;
        };

        let tokenUsageSaveQueue = Promise.resolve();
        const saveTokenUsageHistoryNow = () => {
            const snapshot = cloneForStorage(tokenUsageHistory.value);
            const saveTask = async () => {
                await initDB();
                await setStoredValue('token_usage_history', snapshot, { clone: false });
            };
            tokenUsageSaveQueue = tokenUsageSaveQueue.then(saveTask, saveTask);
            return tokenUsageSaveQueue;
        };
        const recordApiUsage = (usage, meta = {}) => {
            const normalized = normalizeApiUsage(usage);
            tokenUsageHistory.value.unshift({
                id: generateUUID(),
                timestamp: Date.now(),
                type: meta.type || 'chat',
                model: String(meta.model || ''),
                detail: String(meta.detail || ''),
                characterName: currentCharacter.value?.name || '',
                ...normalized
            });
            saveTokenUsageHistoryNow().catch(error => console.error('Token usage history save failed:', error));
        };
        let chatHistorySaveTimer = null;
        let chatHistorySaveQueue = Promise.resolve(true);
        let lastChatSaveErrorToastAt = 0;

        const isRetryableChatStorageError = (error) => {
            const name = String(error?.name || '');
            return isDatabaseClosingError(error)
                || ['AbortError', 'UnknownError', 'InvalidStateError', 'TransactionInactiveError'].includes(name);
        };

        const notifyChatSaveFailure = (error) => {
            console.error('Failed to save chat history after retries:', error);
            const now = Date.now();
            if (now - lastChatSaveErrorToastAt < 5000) return;
            lastChatSaveErrorToastAt = now;
            const message = error?.name === 'QuotaExceededError'
                ? '存储空间不足，聊天记录未能保存，请先释放浏览器存储空间'
                : '聊天记录保存失败，旧记录未被覆盖，请不要刷新并稍后重试';
            showToast(message, 'error', 5000);
        };

        const saveChatHistoryNow = () => {
            if (chatHistorySaveTimer) {
                clearTimeout(chatHistorySaveTimer);
                chatHistorySaveTimer = null;
            }
            const char = currentCharacter.value;
            const characterId = char?.uuid;
            if (currentCharacterIndex.value < 0 || !characterId) return Promise.resolve(false);

            try {
                const conversationId = ensureCurrentChatSession(char);
                if (!conversationId) return Promise.resolve(false);
                const historyToSave = cloneForStorage(chatHistory.value);
                const sessionMeta = buildChatSessionMeta(
                    chatSessions.value.find(session => session.id === conversationId) || { id: conversationId },
                    historyToSave,
                    char
                );
                const sessionStorageId = getConversationStorageScopeId(characterId, conversationId);
                upsertCurrentChatSessionMeta(sessionMeta);
                const sessionStateToSave = cloneForStorage(getChatSessionStatePayload(conversationId));
                const saveTask = async () => {
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            await initDB();
                            await setScopedStoredValue('chat_session', sessionStorageId, historyToSave, { clone: false });
                            await setScopedStoredValue('chat_sessions', characterId, sessionStateToSave, { clone: false });
                            return true;
                        } catch (error) {
                            lastError = error;
                            if (attempt === 3 || !isRetryableChatStorageError(error)) break;
                            await new Promise(resolve => setTimeout(resolve, attempt * 250));
                        }
                    }
                    notifyChatSaveFailure(lastError);
                    return false;
                };

                chatHistorySaveQueue = chatHistorySaveQueue.then(saveTask, saveTask);
                return chatHistorySaveQueue;
            } catch (error) {
                notifyChatSaveFailure(error);
                return Promise.resolve(false);
            }
        };

        const scheduleChatHistorySave = () => {
            if (chatHistorySaveTimer) clearTimeout(chatHistorySaveTimer);
            const delay = (isGenerating.value || isRemoteGenerating.value) ? 1500 : 300;
            chatHistorySaveTimer = setTimeout(() => {
                chatHistorySaveTimer = null;
                saveChatHistoryNow();
            }, delay);
        };

        const flushPendingChatHistorySave = async () => {
            if (chatHistorySaveTimer) {
                await saveChatHistoryNow();
                return;
            }
            await chatHistorySaveQueue;
        };

        const saveMemorySettingsNow = async () => {
            if (!_initComplete) return;
            await initDB();
            await setStoredValue('memory_settings', cloneForStorage(memorySettings), { clone: false });
        };

        const saveMemoriesNow = async () => {
            if (!_memoriesLoaded || !currentCharacter.value?.uuid) return;
            await initDB();
            const memoryScopeId = getActiveConversationMemoryScopeId();
            if (!memoryScopeId) return;
            await setScopedStoredValue('memories', memoryScopeId, await compactMemoriesForStorageAsync(memories.value), { clone: false });
        };

        const saveClassicMemoriesNow = async () => {
            if (!_classicMemoriesLoaded || !currentCharacter.value?.uuid) return;
            await initDB();
            const memoryScopeId = getActiveConversationMemoryScopeId();
            if (!memoryScopeId) return;
            await setScopedStoredValue('classic_memories', memoryScopeId, cloneForStorage(classicMemories.value), { clone: false });
        };

        const saveData = async (options = {}) => {
            const { saveMemories = true } = options;
            try {
                await initDB();
                settings.contextSize = MAX_CONTEXT_SIZE;
                normalizeActiveToolAggressivenessSettings();
                await setStoredValue('characters', characters.value);
                await setStoredValue('settings', settings);
                await setStoredValue('presets', presets.value);
                await setStoredValue('regex', regexScripts.value);
                await setStoredValue('global_regex', globalRegexScripts.value);
                await setStoredValue('worldinfo', worldInfo.value);
                await setStoredValue('global_worldinfo', globalWorldInfo.value);
                await setStoredValue('worldinfo_settings', worldInfoSettings);
                await setStoredValue('global_ui_templates', globalUiTemplates.value);
                await setStoredValue('active_tools', normalizeActiveTools(), { clone: false });
                // await setStoredValue('recent_times', recentGenerationTimes.value); // Deprecated: Saved in character

                // 守卫：初始化完成前不写入用户/记忆数据，防止默认值覆盖服务端已有数据
                if (_initComplete) {
                    await setStoredValue('user', user);
                    await setStoredValue('user_profiles', JSON.parse(JSON.stringify(userProfiles.value)));
                    if (activeProfileId.value) await setStoredValue('active_profile_id', activeProfileId.value);
                }

                // Save Chat State
                if (currentCharacterIndex.value >= 0) {
                    await setStoredValue('last_active_char', currentCharacterIndex.value);
                    await saveChatHistoryNow();
                }

                // Save Memory State
                await saveMemorySettingsNow();
                if (saveMemories) {
                    await saveMemoriesNow();
                    await saveClassicMemoriesNow();
                }
            } catch (e) {
                console.error('Save failed:', e);
                if (e.name === 'QuotaExceededError') {
                    showToast('存储空间不足，无法保存', 'error');
                }
            }
        };

        const saveConversationMutationNow = async ({ saveTemplateRuntime = false } = {}) => {
            try {
                await initDB();
                await saveChatHistoryNow();
                await saveMemoriesNow();
                await saveClassicMemoriesNow();
                if (saveTemplateRuntime) {
                    await setStoredValue('characters', characters.value);
                    await setStoredValue('global_ui_templates', globalUiTemplates.value);
                }
            } catch (e) {
                console.error('Save conversation mutation failed:', e);
            }
        };

        const removeUiTemplateRuntimeForConversation = (char, sessionId) => {
            const key = getConversationStorageScopeId(char?.uuid, sessionId);
            if (!key) return;
            const templates = [
                ...(globalUiTemplates.value || []),
                ...(Array.isArray(char?.uiTemplates) ? char.uiTemplates : [])
            ];
            templates.forEach(template => {
                if (template?.runtimeByCharacter && typeof template.runtimeByCharacter === 'object') {
                    delete template.runtimeByCharacter[key];
                }
            });
        };

        const deleteConversationScopedData = async (char, sessionId) => {
            const scopeId = getConversationStorageScopeId(char?.uuid, sessionId);
            if (!scopeId) return;
            removeUiTemplateRuntimeForConversation(char, sessionId);
            if (memorySettings.emptyTurns) {
                delete memorySettings.emptyTurns[getMemoryEmptyTurnsKey(scopeId)];
            }
            await Promise.allSettled([
                deleteScopedStoredValue('chat_session', scopeId),
                deleteScopedStoredValue('memories', scopeId),
                deleteScopedStoredValue('classic_memories', scopeId)
            ]);
        };

        const deleteAllChatSessionsForCharacter = async (char) => {
            if (!char?.uuid) return;
            let state = null;
            try {
                state = normalizeChatSessionState(await getScopedStoredValue('chat_sessions', char.uuid), char);
            } catch (_) {
                state = { sessions: [] };
            }
            await Promise.allSettled((state.sessions || []).map(session => deleteConversationScopedData(char, session.id)));
            await Promise.allSettled([
                deleteScopedStoredValue('chat_sessions', char.uuid),
                deleteScopedStoredValue('chat', char.uuid)
            ]);
        };

        /* extracted generateUUID */
