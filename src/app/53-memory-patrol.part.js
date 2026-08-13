// 53-memory-patrol.part.js：由 build-app.js 按 setup 依赖顺序组装。
const waitForMemoryConversationIdle = (signal) => new Promise(resolve => {
            if (!isConversationBusy.value || signal?.aborted) {
                resolve();
                return;
            }
            let stopWatching = () => { };
            const finish = () => {
                stopWatching();
                signal?.removeEventListener('abort', finish);
                resolve();
            };
            stopWatching = watch(isConversationBusy, busy => {
                if (!busy) finish();
            });
            signal?.addEventListener('abort', finish, { once: true });
        });

        const startVectorBatchMemoryExtraction = async (options = {}) => {
            const { manual = true } = options;
            if (isBatchExtracting.value || !currentCharacter.value || chatHistory.value.length === 0) return;
            if (!getMemoryEmbeddingModel()) {
                if (manual) showToast('请先选择向量嵌入模型', 'warning');
                return;
            }

            const batchController = new AbortController();
            _batchExtractAbort = batchController;
            _vectorBatchRescanRequested = false;
            isBatchExtracting.value = true;
            batchExtractProgress.value = { current: 0, total: 0 };
            let totalAdded = 0;

            try {
                if (!memorySettings.emptyTurns) memorySettings.emptyTurns = {};
                const uuid = getActiveConversationMemoryScopeId();
                const emptyLogKey = getMemoryEmptyTurnsKey(uuid);
                if (!memorySettings.emptyTurns[emptyLogKey]) memorySettings.emptyTurns[emptyLogKey] = [];
                const emptyLog = memorySettings.emptyTurns[emptyLogKey];

                while (_batchExtractAbort === batchController && !batchController.signal.aborted) {
                    _vectorBatchRescanRequested = false;
                    const snapshot = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false });
                    const safeTurns = isConversationBusy.value ? snapshot.turns.slice(0, -1) : snapshot.turns;
                    const emptyTurnSet = new Set(emptyLog);
                    const chunks = safeTurns
                        .filter(turnInfo => !emptyTurnSet.has(turnInfo.turn))
                        .map(turnInfo => ({
                            data: turnInfo.messages,
                            endIdx: turnInfo.endIndex,
                            turnValue: turnInfo.turn
                        }));
                    const scannedTurnCount = safeTurns.length;
                    const added = chunks.length > 0
                        ? await _doBatchEmbedMemoryChunks(chunks, batchController.signal, emptyLog, { interactive: manual })
                        : 0;
                    totalAdded += added;

                    if (isConversationBusy.value) {
                        await waitForMemoryConversationIdle(batchController.signal);
                        continue;
                    }
                    const currentTurnCount = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false }).turns.length;
                    if (added > 0 || _vectorBatchRescanRequested || currentTurnCount !== scannedTurnCount) continue;
                    break;
                }

                if (_batchExtractAbort === batchController) {
                    if (totalAdded > 0) {
                        if (manual) showToast(`向量补录完成：新增 ${totalAdded} 个分片`, 'success');
                    } else {
                        if (manual) showNoMemoryNeededModal.value = true;
                    }
                }
            } catch (error) {
                if (_batchExtractAbort !== batchController) return;
                if (error.name !== 'AbortError') {
                    console.error('Vector memory patrol failed:', error);
                }
            } finally {
                if (_batchExtractAbort === batchController) {
                    _batchExtractAbort = null;
                    isBatchExtracting.value = false;
                }
            }
        };

        const abortClassicBatchExtraction = () => {
            _classicExtractionEpoch++;
            if (_classicBatchExtractAbort) _classicBatchExtractAbort.abort();
            _classicBatchExtractAbort = null;
            _classicBatchRescanRequested = false;
            isClassicBatchExtracting.value = false;
        };

        const startClassicBatchMemoryExtraction = async (options = {}) => {
            const { manual = true } = options;
            if (isClassicBatchExtracting.value || !currentCharacter.value || chatHistory.value.length === 0) return;
            if (!String(memorySettings.classicModel || '').trim()) {
                if (manual) showToast('请先选择总结模式副模型', 'warning');
                return;
            }

            const batchController = new AbortController();
            _classicBatchExtractAbort = batchController;
            _classicBatchRescanRequested = false;
            isClassicBatchExtracting.value = true;
            classicBatchExtractProgress.value = { current: 0, total: 0 };
            let totalAdded = 0;
            let foundJobs = false;

            try {
                while (_classicBatchExtractAbort === batchController && !batchController.signal.aborted) {
                    _classicBatchRescanRequested = false;
                    const snapshot = await ensureClassicMessageIds();
                    if (_classicBatchExtractAbort !== batchController || batchController.signal.aborted) return;
                    const safeTurnCount = isConversationBusy.value
                        ? Math.max(0, snapshot.turns.length - 1)
                        : snapshot.turns.length;
                    const jobs = snapshot.turns
                        .slice(0, safeTurnCount)
                        .map((_, index) => buildClassicSummaryJob(snapshot, index))
                        .filter(job => job && !hasClassicMemoryForJob(job));
                    if (jobs.length > 0) {
                        foundJobs = true;
                        classicBatchExtractProgress.value = { current: 0, total: jobs.length };
                    }

                    const runClassicJob = async job => {
                        try {
                            return { job, added: await generateAndStoreClassicMemory(job, batchController.signal) };
                        } catch (error) {
                            return { job, error };
                        }
                    };
                    const concurrency = normalizeClassicMemoryConcurrency(memorySettings.classicConcurrency);
                    for (let offset = 0; offset < jobs.length; offset += concurrency) {
                        if (_classicBatchExtractAbort !== batchController || batchController.signal.aborted) break;
                        const group = jobs.slice(offset, offset + concurrency);
                        const results = await Promise.all(group.map(runClassicJob));
                        if (_classicBatchExtractAbort !== batchController || batchController.signal.aborted) break;

                        const groupAdded = results.filter(result => result.added).length;
                        totalAdded += groupAdded;
                        if (groupAdded > 0) await saveClassicMemoriesNow();
                        for (const failed of results.filter(result => result.error)) {
                            if (!manual) throw failed.error;
                            let retryError = failed.error;
                            while (true) {
                                if (retryError.name === 'AbortError') throw retryError;
                                const retry = await showVueConfirmModal(
                                    '总结模式补录遇到错误',
                                    `第 ${failed.job.turn} 轮生成失败：\n${retryError.message}\n\n是否立即重试？`
                                );
                                if (!retry) throw retryError;
                                const retryResult = await runClassicJob(failed.job);
                                if (!retryResult.error) {
                                    if (retryResult.added) {
                                        totalAdded++;
                                        await saveClassicMemoriesNow();
                                    }
                                    break;
                                }
                                retryError = retryResult.error;
                            }
                        }
                        classicBatchExtractProgress.value.current = Math.min(offset + group.length, jobs.length);
                    }

                    if (isConversationBusy.value) {
                        await waitForMemoryConversationIdle(batchController.signal);
                        continue;
                    }
                    const currentTurnCount = buildConversationTurnSnapshot(chatHistory.value, { includeSystem: false }).turns.length;
                    if (jobs.length > 0 || _classicBatchRescanRequested || currentTurnCount !== safeTurnCount) continue;
                    break;
                }

                if (_classicBatchExtractAbort === batchController) {
                    if (foundJobs) {
                        if (manual) showToast(`总结模式补录完成：新增 ${totalAdded} 条记忆`, 'success');
                    } else {
                        if (manual) showNoMemoryNeededModal.value = true;
                    }
                }
            } catch (error) {
                if (_classicBatchExtractAbort !== batchController) {
                    return;
                } else if (error.name !== 'AbortError') {
                    console.error('Classic memory batch extraction failed:', error);
                }
            } finally {
                if (_classicBatchExtractAbort === batchController) {
                    _classicBatchExtractAbort = null;
                    isClassicBatchExtracting.value = false;
                }
            }
        };

        const startAutomaticMemoryPatrol = (mode = memorySettings.mode) => {
            if (SIMPLE_CHAT_AI_MODE) return Promise.resolve(false);
            if (!memorySettings.enabled || !currentCharacter.value) return Promise.resolve(false);
            if (mode === MEMORY_MODE_CLASSIC) {
                if (isClassicBatchExtracting.value) {
                    _classicBatchRescanRequested = true;
                    return Promise.resolve(false);
                }
                return _classicMemoriesLoaded
                    ? startClassicBatchMemoryExtraction({ manual: false })
                    : Promise.resolve(false);
            }
            if (isBatchExtracting.value) {
                _vectorBatchRescanRequested = true;
                return Promise.resolve(false);
            }
            return _memoriesLoaded
                ? startVectorBatchMemoryExtraction({ manual: false })
                : Promise.resolve(false);
        };

        watch([
            () => memorySettings.enabled,
            () => memorySettings.embeddingModel,
            () => memorySettings.classicModel
        ], ([enabled]) => {
            if (enabled && _initComplete) nextTick(() => startAutomaticMemoryPatrol());
        });

        const startBatchMemoryExtraction = () => (
            memorySettings.mode === MEMORY_MODE_CLASSIC
                ? startClassicBatchMemoryExtraction({ manual: true })
                : startVectorBatchMemoryExtraction({ manual: true })
        );

        const abortBatchExtraction = () => (
            memorySettings.mode === MEMORY_MODE_CLASSIC
                ? abortClassicBatchExtraction()
                : abortVectorBatchExtraction()
        );
