// 42-api-models.part.js：由 build-app.js 按 setup 依赖顺序组装。
// API & Models
        const getApiEndpoint = (path) => settings.apiUrl.endsWith('/v1')
            ? `${settings.apiUrl}/${path}`
            : `${settings.apiUrl}/v1/${path}`;

        const fetchModels = async (isManual = false) => {
            const apiKey = String(settings.apiKey || '').trim();
            if (!apiKey) {
                if (isManual) showToast('请先填写当前 API 预设的 Key', 'info');
                return;
            }
            try {
                if (isManual) showToast('正在获取模型列表...', 'info');
                const url = getApiEndpoint('models');
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!response.ok) throw new Error('Failed to fetch models');
                const data = await response.json();
                availableModels.value = data.data || [];
                if (isManual) showToast(`成功获取 ${availableModels.value.length} 个模型`, 'success');
            } catch (error) {
                console.error(error);
                showToast('获取模型失败: ' + error.message, 'error');
            }
        };

        const openModelSelector = (target) => {
            modelSelectionTarget.value = target;
            if (target === 'memoryEmbeddingModel') {
                modelSearchQuery.value = 'embedding';
                activeModelTag.value = 'all';
            } else if (modelSearchQuery.value === 'embedding') {
                modelSearchQuery.value = '';
            }
            showModelSelector.value = true;
        };

        const selectModel = (modelId) => {
            if (modelSelectionTarget.value === 'memoryEmbeddingModel') {
                memorySettings.embeddingModel = modelId;
                showModelSelector.value = false;
                return;
            }
            if (modelSelectionTarget.value === 'memoryClassicModel') {
                memorySettings.classicModel = modelId;
                showModelSelector.value = false;
                return;
            }

            settings[modelSelectionTarget.value] = modelId;

            if (
                (modelSelectionTarget.value === 'qualityModel' && currentModelMode.value === 'quality') ||
                (modelSelectionTarget.value === 'balancedModel' && currentModelMode.value === 'balanced') ||
                (modelSelectionTarget.value === 'fastModel' && currentModelMode.value === 'fast')
            ) {
                settings.model = modelId;
            }

            showModelSelector.value = false;
        };

        const prepareChatModelSelector = () => {
            modelSelectionTarget.value = 'model';
            if (modelSearchQuery.value === 'embedding') modelSearchQuery.value = '';
            activeModelTag.value = 'all';
        };

        const toggleChatModelSelector = () => {
            const shouldOpen = !showChatModelSelector.value;
            prepareChatModelSelector();
            showChatModelSelector.value = shouldOpen;
        };

        const selectChatModel = (modelId) => {
            settings.model = modelId;
            settings.qualityModel = modelId;
            currentModelMode.value = 'quality';
            showChatModelSelector.value = false;
        };

        const refreshChatModels = async () => {
            prepareChatModelSelector();
            await fetchModels(true);
            showChatModelSelector.value = true;
        };

        const checkConnectionStatus = async (status, latency, label, request, isConnected = response => response.ok) => {
            status.value = 'checking';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const startTime = performance.now();
            try {
                const response = await request(controller.signal);
                if (!isConnected(response)) {
                    status.value = 'error';
                    return;
                }
                status.value = 'connected';
                latency.value = Math.round(performance.now() - startTime);
            } catch (error) {
                console.warn(`${label} Status Check Failed:`, error);
                status.value = 'error';
            } finally {
                clearTimeout(timeoutId);
            }
        };

        const checkApiStatus = async () => {
            if (!settings.apiUrl || !settings.apiKey) {
                apiStatus.value = 'error';
                return;
            }
            await checkConnectionStatus(apiStatus, apiLatency, 'API', signal => (
                fetch(getApiEndpoint('models'), {
                    headers: { 'Authorization': `Bearer ${settings.apiKey}` },
                    signal
                })
            ));
        };

        const checkImageGenStatus = async () => {
            if (!settings.imageApiUrl || !settings.imageApiKey) {
                imageGenStatus.value = 'error';
                return;
            }
            await checkConnectionStatus(imageGenStatus, imageGenLatency, 'Image API', signal => (
                fetch(getImageApiEndpoint().replace(/\/responses$/i, '/models'), {
                    headers: { 'Authorization': `Bearer ${settings.imageApiKey}` },
                    signal
                })
            ));
        };

        const checkAllStatuses = () => {
            checkApiStatus();
            checkImageGenStatus();
        };

        const createAbortReason = (message = 'Operation aborted') => {
            if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
            const error = new Error(message);
            error.name = 'AbortError';
            return error;
        };
        const abortSafely = (controller, message) => {
            if (!controller || controller.signal?.aborted) return;
            controller.abort(createAbortReason(message));
        };
