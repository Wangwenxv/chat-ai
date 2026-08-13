// 10-state-core.part.js：由 build-app.js 按 setup 依赖顺序组装。
// --- State ---
        const globalConfirmModal = ref({
            show: false,
            title: '',
            message: '',
            onConfirm: null,
            onCancel: null
        });

        const showVueConfirmModal = (title, message) => {
            return new Promise((resolve) => {
                globalConfirmModal.value = {
                    show: true,
                    title,
                    message,
                    onConfirm: () => {
                        globalConfirmModal.value.show = false;
                        resolve(true);
                    },
                    onCancel: () => {
                        globalConfirmModal.value.show = false;
                        resolve(false);
                    }
                };
            });
        };

        // 通过入口文件名初始化当前视图，让每个独立页面只渲染自己的主体。
        const currentView = ref(window.ChatAINavigation?.currentPage || 'chat');
        const showAdvancedFeatures = ref(!SIMPLE_CHAT_AI_MODE);
        let isMobileSidebarOpen = false;
        const isSidebarCollapsed = ref(false);
        const isAdvancedNavOpen = ref(false);
        const toggleAdvancedNav = () => {
            if (isSidebarCollapsed.value) {
                isSidebarCollapsed.value = false;
                isAdvancedNavOpen.value = true;
                return;
            }
            isAdvancedNavOpen.value = !isAdvancedNavOpen.value;
        };
        const showDescriptionPanel = ref(false);
        const showApiSettingsModal = ref(false);
        const showModelSelector = ref(false);
        const modelSelectionTarget = ref('model');
        const showChatModelSelector = ref(false);
        const showCharacterEditor = ref(false);
        const showPresetEditor = ref(false);
        const showUiTemplateEditor = ref(false);
        const uiTemplateUpdateStatus = reactive({ state: 'idle', message: '待命', time: 0, remaining: 0, targetMessageId: null });
        let uiTemplateUpdateSeq = 0;
        let uiTemplateUpdateAbortController = null;
        const showRegexEditor = ref(false);
        const showWorldInfoEditor = ref(false);
        const showActiveToolEditor = ref(false);
        const showUserSetupModal = ref(false);
        const showAutoImageGenModal = ref(false);
        const generationMode = ref('chat');
        const pendingReferenceImages = ref([]);
        const referenceImageInput = ref(null);
        const pendingActiveToolContext = ref('');
        const activeToolResultContexts = ref([]);
        const tempUserSetup = reactive({ name: '', description: '', person: 'second' });
        const characterDisplayLimit = ref(8);

        // Quota State
        const quotaValue = ref(0);
        const quotaLoading = ref(false);
        const quotaError = ref(false);

        const fetchQuota = async () => {
            quotaLoading.value = true;
            quotaError.value = false;
            try {
                const imageGenToken = settings.imageGenKey.trim();
                if (!imageGenToken) {
                    quotaValue.value = 0;
                    return;
                }
                const baseUrl = IMAGE_GEN_BASE_URL;
                const response = await fetch(`${baseUrl}/api/api/getUser`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toUserId: imageGenToken })
                });
                const data = await response.json();
                if (data.status === 'ok' && data.type === 'sta1n') {
                    const val = Number.parseInt(data.data?.value, 10);
                    if (!Number.isFinite(val)) throw new Error('Invalid quota value');
                    quotaValue.value = val;
                } else {
                    quotaError.value = true;
                }
            } catch (e) {
                console.error('Quota fetch error:', e);
                quotaError.value = true;
            } finally {
                quotaLoading.value = false;
            }
        };

        const showConfirmModal = ref(false);
        const confirmMessage = ref('');
        const confirmCallback = ref(null);
        const showNoMemoryNeededModal = ref(false);
        const isGenerating = ref(false);
        const isRemoteGenerating = ref(false); // 新增：远程生成状态
        const remoteEstimatedTime = ref(null); // 新增：远程预计时间
        const isReceiving = ref(false);
        const isThinking = ref(false);
        const activeToolContinuationMessageId = ref(null);
        const activeToolContinuationToolCallId = ref(null);
        const activeToolContinuationHasResponse = ref(false);
        const activeToolHandoffPending = ref(false);
        const activeToolQueueRunning = ref(false);
        const activeToolContinuationPending = ref(false);
        let activeToolQueueAbortController = null;
        const abortController = ref(null);
        const userInput = ref('');
        const modelSearchQuery = ref('');
        const activeModelTag = ref('all');
        const popularModelFamilies = ['claude', 'gemini', 'deepseek', 'llama', 'glm', 'minimax', 'moonshot', 'grok'];
        const characterSearchQuery = ref('');
        const availableModels = ref([]);
        const toasts = ref([]);
        let toastIdSeed = 0;
        const chatContainer = ref(null);
        const isChatFullscreen = ref(false);
        const isMobileKeyboardOpen = ref(false);
        const inputBox = ref(null);
        const messageElements = ref([]);
        let mobileViewportRaf = null;
        let mobileKeyboardBlurTimer = null;
        let lastAppliedMobileViewportHeight = 0;
        let lastAppliedMobileKeyboardInset = 0;
        let lastAppliedMobileBackgroundHeight = 0;
        // IntersectionObserver for lazy loading images or other visibility triggers could go here

        let scrollRevealObserver = null;
        const initScrollReveal = () => {
            if (window.IntersectionObserver) {
                scrollRevealObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('reveal-active');
                        }
                    });
                }, {
                    threshold: 0,
                    rootMargin: '50px 0px 50px 0px'
                });
            }
        };

        // Watch for changes in the message list to observe new bubbles
        watch(messageElements, (newEls) => {
            if (!scrollRevealObserver) initScrollReveal();
            if (scrollRevealObserver && newEls) {
                newEls.forEach(el => {
                    if (el instanceof HTMLElement && !el.classList.contains('reveal-active')) {
                        scrollRevealObserver.observe(el);
                    }
                });
            }
        }, { deep: true, flush: 'post' });


        const autoResizeInput = () => {
            if (inputBox.value) {
                inputBox.value.style.height = 'auto';
                if (userInput.value === '') {
                    inputBox.value.style.height = '';
                } else {
                    inputBox.value.style.height = Math.min(inputBox.value.scrollHeight, 180) + 'px';
                }
            }
        };

        watch(userInput, () => {
            nextTick(autoResizeInput);
        });

        const isMobileViewport = () => (
            (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
            || window.innerWidth <= 768
        );

        const setMobileSidebarOpen = (open) => {
            const shouldOpen = !!open && isMobileViewport();
            isMobileSidebarOpen = shouldOpen;
            document.querySelector('.app-sidebar')?.classList.toggle('mobile-sidebar-open', shouldOpen);
            document.querySelector('.mobile-overlay')?.classList.toggle('mobile-sidebar-open', shouldOpen);
        };

        const toggleMobileMenu = () => {
            setMobileSidebarOpen(!isMobileSidebarOpen);
        };

        const closeMobileMenu = () => {
            setMobileSidebarOpen(false);
        };

        const applyMobileVisualViewportHeight = (height, { force = false } = {}) => {
            if (!Number.isFinite(height) || height <= 0) return;
            const safeHeight = Math.max(320, Math.round(height));
            if (!force && Math.abs(safeHeight - lastAppliedMobileViewportHeight) < 2) return;
            lastAppliedMobileViewportHeight = safeHeight;
            document.documentElement.style.setProperty('--app-visual-height', `${safeHeight}px`);
            const appElement = document.getElementById('app');
            if (appElement?.style.height) appElement.style.height = '';
        };

        const applyMobileKeyboardInset = (inset, { force = false } = {}) => {
            const safeInset = Math.max(0, Math.round(Number(inset) || 0));
            if (!force && Math.abs(safeInset - lastAppliedMobileKeyboardInset) < 2) return;
            lastAppliedMobileKeyboardInset = safeInset;
            document.documentElement.style.setProperty('--keyboard-inset', `${safeInset}px`);
        };

        const applyMobileBackgroundHeight = (height, { force = false } = {}) => {
            if (!Number.isFinite(height) || height <= 0) return;
            const safeHeight = Math.max(
                320,
                Math.round(height),
                Math.round(lastAppliedMobileBackgroundHeight || 0)
            );
            if (!force && Math.abs(safeHeight - lastAppliedMobileBackgroundHeight) < 2) return;
            lastAppliedMobileBackgroundHeight = safeHeight;
            document.documentElement.style.setProperty('--chat-bg-height', `${safeHeight}px`);
        };

        const syncMobileVisualViewport = ({ force = false } = {}) => {
            if (!isMobileViewport()) {
                closeMobileMenu();
                isMobileKeyboardOpen.value = false;
                lastAppliedMobileViewportHeight = 0;
                lastAppliedMobileKeyboardInset = 0;
                lastAppliedMobileBackgroundHeight = 0;
                document.documentElement.style.removeProperty('--app-visual-height');
                document.documentElement.style.removeProperty('--keyboard-inset');
                document.documentElement.style.removeProperty('--chat-bg-height');
                return;
            }

            const viewport = window.visualViewport;
            const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
            const layoutHeight = window.innerHeight || document.documentElement.clientHeight || height;
            const viewportOffsetTop = viewport?.offsetTop || 0;
            const visualHeightForLayout = viewport ? height + viewportOffsetTop : height;
            const inputFocused = document.activeElement === inputBox.value;
            const keyboardInset = viewport
                ? Math.max(0, layoutHeight - height - viewportOffsetTop)
                : 0;
            const viewportCompressed = viewport && height < layoutHeight - 80;
            const keyboardOpen = !!(viewportCompressed || keyboardInset > 40);
            const keyboardInsetForLayout = keyboardOpen ? keyboardInset : 0;
            const appHeightForLayout = keyboardInsetForLayout > 0 ? layoutHeight : visualHeightForLayout;
            const freezeBackground = inputFocused || keyboardOpen || isMobileKeyboardOpen.value;
            const backgroundHeight = freezeBackground
                ? Math.max(lastAppliedMobileBackgroundHeight, lastAppliedMobileViewportHeight, appHeightForLayout)
                : Math.max(layoutHeight, visualHeightForLayout);

            applyMobileVisualViewportHeight(appHeightForLayout, { force });
            applyMobileKeyboardInset(keyboardInsetForLayout, { force });
            applyMobileBackgroundHeight(backgroundHeight, { force });
            isMobileKeyboardOpen.value = !!(inputFocused || keyboardOpen);

        };

        const scheduleMobileVisualViewportSync = (options = {}) => {
            if (mobileViewportRaf) cancelAnimationFrame(mobileViewportRaf);
            mobileViewportRaf = requestAnimationFrame(() => {
                mobileViewportRaf = null;
                syncMobileVisualViewport(options);
            });
        };

        const handleChatInputFocus = () => {
            if (!isMobileViewport()) return;
            clearTimeout(mobileKeyboardBlurTimer);
            isMobileKeyboardOpen.value = true;
            scheduleMobileVisualViewportSync({ force: true });
        };

        const handleChatInputBlur = () => {
            clearTimeout(mobileKeyboardBlurTimer);
            mobileKeyboardBlurTimer = setTimeout(() => {
                isMobileKeyboardOpen.value = false;
                scheduleMobileVisualViewportSync({ force: true });
            }, 180);
        };

        const handleMobileViewportResize = () => scheduleMobileVisualViewportSync();
        const handleMobileOrientationChange = () => {
            lastAppliedMobileBackgroundHeight = 0;
            document.documentElement.style.removeProperty('--chat-bg-height');
            scheduleMobileVisualViewportSync({ force: true });
        };

        // Service Status
        const apiStatus = ref('unknown'); // 'unknown', 'checking', 'connected', 'error'
        const apiLatency = ref(0);
        const imageGenStatus = ref('unknown');
        const imageGenLatency = ref(0);

        const user = reactive({
            name: DEFAULT_USER_NAME_PLACEHOLDER,
            description: '',
            avatar: '',
            person: 'second', //记录人称偏好：second 或 third
        });
        const buildUserInfoPrompt = () => [
            '[User Info]',
            `Name: ${user.name || ''}`,
            `Description: ${user.description || ''}`
        ].join('\n');
        // 角色卡标准宏在发送前展开，避免角色设定中出现未替换的 {{char}} 或 {{user}}。
        const replaceCharacterCardMacros = (text, character = currentCharacter.value) => String(text || '')
            .replace(/\{\{char\}\}/gi, character?.name || '')
            .replace(/\{\{user\}\}/gi, user.name || 'User');

        // 角色卡模式下，系统提示词只从当前角色卡字段生成，避免固定身份覆盖已选择角色。
        const getCurrentCharacterPrompt = () => {
            const character = currentCharacter.value;
            if (!character) return '';

            return [
                character.system_prompt,
                character.name ? `Name: ${character.name}` : '',
                character.description ? `Description:\n${character.description}` : '',
                character.personality ? `Personality:\n${character.personality}` : '',
                character.scenario ? `Scenario:\n${character.scenario}` : ''
            ].map(value => replaceCharacterCardMacros(value, character))
                .filter(value => String(value || '').trim())
                .join('\n\n');
        };

        const loadChatAiCharacterCard = async () => {
            if (!SIMPLE_CHAT_AI_MODE) return;
            try {
                await defaultCharacterService.load();
                const builtinCharacter = characters.value.find(char => char?.uuid === DEFAULT_CHAT_AI_CHARACTER_UUID);
                if (builtinCharacter) Object.assign(builtinCharacter, createDefaultChatAiCharacter());
            } catch (error) {
                console.warn('Failed to load chat-ai character card, using fallback character:', error);
            }
        };

        const userProfiles = ref([]);
        const activeProfileId = ref(null);
        const showProfileDropdown = ref(false);

        const ensureSimpleChatAiUserProfile = () => {
            if (!SIMPLE_CHAT_AI_MODE || user.name !== DEFAULT_USER_NAME_PLACEHOLDER) return;
            user.name = 'User';
            if (!user.uuid) user.uuid = generateUUID();
            const activeProfile = userProfiles.value.find(profile => profile.uuid === activeProfileId.value);
            if (activeProfile) {
                activeProfile.name = user.name;
                activeProfile.description = user.description;
                activeProfile.avatar = user.avatar;
                activeProfile.person = user.person;
            }
        };

        watch(user, (newVal) => {
            if (activeProfileId.value && userProfiles.value.length > 0) {
                const profileIndex = userProfiles.value.findIndex(p => p.uuid === activeProfileId.value);
                if (profileIndex !== -1) {
                    const currentProfile = userProfiles.value[profileIndex];
                    if (currentProfile.name !== newVal.name ||
                        currentProfile.description !== newVal.description ||
                        currentProfile.avatar !== newVal.avatar ||
                        currentProfile.person !== newVal.person) {
                        userProfiles.value[profileIndex] = JSON.parse(JSON.stringify(newVal));
                        userProfiles.value[profileIndex].uuid = activeProfileId.value;
                    }
                }
            }
        }, { deep: true });

        const MAX_CONTEXT_SIZE = 1000000;

        const settings = reactive({
            apiUrl: DEFAULT_API_CONFIG.apiUrl,
            apiKey: DEFAULT_API_CONFIG.apiKey,
            apiProviderId: DEFAULT_API_PROVIDER_ID,
            apiProviderKeys: {},
            customApiUrl: '',
            customApiUrl2: '',
            model: DEFAULT_API_CONFIG.qualityModel,
            contextSize: MAX_CONTEXT_SIZE,
            temperature: 1.0,
            autoFetchModels: true,
            stream: true,
            activeToolAggressiveness: 'adaptive',
            activeToolAggressivenessVersion: 2,

            useCharacterBackground: true,
            immersiveMode: false,
            uiTemplateEnabled: false,
            uiTemplateModel: '',
            uiTemplateAnalysisDepth: 4,
            uiTemplateInjectContext: false,
            uiTemplateMainModelAnalysis: true,
            fontFamily: 'modern',
            fontFamilyVersion: 4,
            fontSize: window.innerWidth > 768 ? 16 : 14,
            imageGenKey: '',
            imageStyle: 'vertical',
            customImageArtists: '',
            imageSize: '竖图',
            imageGenCount: 2,
            imageApiUrl: DEFAULT_IMAGE_API_URL,
            imageApiKey: '',
            imageChatModel: DEFAULT_IMAGE_CHAT_MODEL,
            imageModel: DEFAULT_IMAGE_MODEL,
            imageOutputFormat: 'png',
            imageOutputSize: '1024x1024',
            imageReasoningEffort: 'high',
            qualityModel: DEFAULT_API_CONFIG.qualityModel,
            balancedModel: DEFAULT_API_CONFIG.balancedModel,
            fastModel: DEFAULT_API_CONFIG.fastModel
        });

        const normalizeImageGenerationSettings = () => {
            settings.imageApiUrl = String(settings.imageApiUrl || DEFAULT_IMAGE_API_URL).trim();
            settings.imageApiKey = String(settings.imageApiKey || '');
            settings.imageChatModel = String(settings.imageChatModel || DEFAULT_IMAGE_CHAT_MODEL).trim();
            settings.imageModel = String(settings.imageModel || DEFAULT_IMAGE_MODEL).trim();
            if (!['png', 'jpeg', 'webp'].includes(settings.imageOutputFormat)) settings.imageOutputFormat = 'png';
            if (!['1024x1024', '1024x1536', '1536x1024', '2048x2048', '2160x3840', '3840x2160'].includes(settings.imageOutputSize)) {
                settings.imageOutputSize = '1024x1024';
            }
            if (!['low', 'medium', 'high'].includes(settings.imageReasoningEffort)) settings.imageReasoningEffort = 'high';
        };

        const normalizeFontFamily = (value) => ['modern', 'serif', 'system'].includes(value) ? value : 'modern';
        const applyFontFamily = (value) => {
            document.documentElement.dataset.appFont = normalizeFontFamily(value);
        };
        watch(() => settings.fontFamily, applyFontFamily, { immediate: true });

        const showApiProviderSelector = ref(false);
        const selectedApiProviderId = ref(DEFAULT_API_PROVIDER_ID);
        const customApiProviderOption = {
            id: 'custom',
            name: '自定义',
            apiUrl: '',
            icon: ''
        };
        const customApiProviderOption2 = {
            id: 'custom2',
            name: '自定义2',
            apiUrl: '',
            icon: ''
        };
        const customApiProviderOptions = [customApiProviderOption, customApiProviderOption2];
        const isCustomApiProviderId = (id) => customApiProviderOptions.some(provider => provider.id === id);
        const getCustomApiUrlKey = (id) => id === 'custom2' ? 'customApiUrl2' : 'customApiUrl';
        const normalizeApiProviderUrl = (url) => String(url || '').replace(/\/+$/, '').toLowerCase();
        const getApiProviderById = (id) => apiProviderOptions.find(provider => provider.id === id);
        const getApiProviderByUrl = (url) => {
            const currentUrl = normalizeApiProviderUrl(url);
            return apiProviderOptions.find(provider => normalizeApiProviderUrl(provider.apiUrl) === currentUrl);
        };
        const syncCurrentApiKeyToProvider = () => {
            const providerId = settings.apiProviderId || selectedApiProvider.value.id || DEFAULT_API_PROVIDER_ID;
            if (!settings.apiProviderKeys || typeof settings.apiProviderKeys !== 'object' || Array.isArray(settings.apiProviderKeys)) {
                settings.apiProviderKeys = {};
            }
            settings.apiProviderKeys[providerId] = settings.apiKey || '';
            if (isCustomApiProviderId(providerId)) {
                settings[getCustomApiUrlKey(providerId)] = settings.apiUrl || '';
            }
        };
        const normalizeApiProviderSettings = () => {
            if (!settings.apiProviderKeys || typeof settings.apiProviderKeys !== 'object' || Array.isArray(settings.apiProviderKeys)) {
                settings.apiProviderKeys = {};
            }
            [...apiProviderOptions, ...customApiProviderOptions].forEach(provider => {
                if (typeof settings.apiProviderKeys[provider.id] !== 'string') {
                    settings.apiProviderKeys[provider.id] = '';
                }
            });

            let provider = getApiProviderById(settings.apiProviderId);
            if (!provider && !isCustomApiProviderId(settings.apiProviderId)) {
                provider = getApiProviderByUrl(settings.apiUrl);
                settings.apiProviderId = provider?.id || DEFAULT_API_PROVIDER_ID;
            }
            if (isCustomApiProviderId(settings.apiProviderId)) {
                const urlKey = getCustomApiUrlKey(settings.apiProviderId);
                settings[urlKey] = settings[urlKey] || settings.apiUrl || '';
                settings.apiUrl = settings[urlKey];
            } else {
                provider = getApiProviderById(settings.apiProviderId) || getApiProviderById(DEFAULT_API_PROVIDER_ID);
                settings.apiProviderId = provider.id;
                settings.apiUrl = provider.apiUrl;
            }

            selectedApiProviderId.value = settings.apiProviderId;
            if (settings.apiKey && !settings.apiProviderKeys[settings.apiProviderId]) {
                settings.apiProviderKeys[settings.apiProviderId] = settings.apiKey;
            }
            settings.apiKey = settings.apiProviderKeys[settings.apiProviderId] || '';
        };
        const selectedApiProvider = computed(() => {
            const customProvider = customApiProviderOptions.find(provider => (
                provider.id === settings.apiProviderId || provider.id === selectedApiProviderId.value
            ));
            if (customProvider) return customProvider;
            const selectedProvider = getApiProviderById(settings.apiProviderId) || getApiProviderById(selectedApiProviderId.value);
            if (selectedProvider) return selectedProvider;
            return getApiProviderByUrl(settings.apiUrl) || customApiProviderOption;
        });
        const isCustomApiProvider = computed(() => isCustomApiProviderId(selectedApiProvider.value.id));
        const selectApiProvider = (provider) => {
            syncCurrentApiKeyToProvider();
            selectedApiProviderId.value = provider.id;
            settings.apiProviderId = provider.id;
            settings.apiUrl = isCustomApiProviderId(provider.id)
                ? settings[getCustomApiUrlKey(provider.id)] || ''
                : provider.apiUrl;
            settings.apiKey = settings.apiProviderKeys[provider.id] || '';
            showApiProviderSelector.value = false;
        };
        normalizeApiProviderSettings();

        watch(() => settings.apiKey, (newKey) => {
            if (!settings.apiProviderKeys || typeof settings.apiProviderKeys !== 'object' || Array.isArray(settings.apiProviderKeys)) {
                settings.apiProviderKeys = {};
            }
            const providerId = settings.apiProviderId || selectedApiProvider.value.id || DEFAULT_API_PROVIDER_ID;
            if (settings.apiProviderKeys[providerId] !== (newKey || '')) {
                settings.apiProviderKeys[providerId] = newKey || '';
            }
        });

        watch(() => settings.apiUrl, (newUrl) => {
            if (isCustomApiProviderId(settings.apiProviderId)) {
                settings[getCustomApiUrlKey(settings.apiProviderId)] = newUrl || '';
            }
        });

        const syncSettingsToGenerator = () => {
            const iframe = document.querySelector('iframe[src*="character"]');
            if (iframe && iframe.contentWindow) {
                try {
                    const syncData = {
                        type: 'SYNC_SETTINGS',
                        settings: JSON.parse(JSON.stringify(settings))
                    };
                    iframe.contentWindow.postMessage(syncData, '*');
                } catch (e) {
                    console.error('Settings sync failed:', e);
                }
            }
        };

        // Listen for workshop ready message to trigger sync
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'WORKSHOP_READY') {
                syncSettingsToGenerator();
            }
        });

        watch(() => [settings.apiUrl, settings.apiKey, settings.model], ([, , newModel]) => {
            if (newModel !== settings.fastModel && newModel !== settings.balancedModel) {
                settings.qualityModel = newModel; // 确保 qualityModel 也同步更新
            }



            // Update currentModelMode based on the actual selected model
            if (newModel === settings.fastModel) {
                currentModelMode.value = 'fast';
            } else if (newModel === settings.balancedModel) {
                currentModelMode.value = 'balanced';
            } else {
                currentModelMode.value = 'quality';
            }

            syncSettingsToGenerator();
        }, { deep: true });

        // Watch image gen and model settings for sync
        watch(() => [settings.imageGenKey, settings.imageStyle, settings.customImageArtists, settings.imageGenCount, settings.qualityModel, settings.balancedModel, settings.fastModel, settings.uiTemplateModel, settings.fontFamily, settings.fontFamilyVersion], () => {
            syncSettingsToGenerator();
        });

        const currentModelMode = ref('quality');
        const modelMode = computed({
            get: () => {
                return currentModelMode.value;
            },
            set: (val) => {
                currentModelMode.value = val;
                if (val === 'fast') {
                    settings.model = settings.fastModel;
                } else if (val === 'balanced') {
                    settings.model = settings.balancedModel;
                } else {
                    settings.model = settings.qualityModel;
                }
                showModelSelector.value = false;
                showChatModelSelector.value = false;
            }
        });


        const characters = ref([]);
        const showAddCharacterMenu = ref(false);
        const currentCharacterIndex = ref(-1);

        // 默认人格模块只负责卡片映射，应用层注入现有标准化规则以保持行为一致。
        const createDefaultChatAiCharacter = () => defaultCharacterService.createCharacter({
            normalizeWorldInfoEntry,
            normalizeRegexScript,
            normalizeUiTemplate,
            sanitizeUiTemplateImportEntry,
            generateUUID
        });

        const ensureSimpleChatAiCharacter = () => {
            if (!SIMPLE_CHAT_AI_MODE) return;
            const defaultCharacter = createDefaultChatAiCharacter();
            const existing = characters.value.find(char => char?.uuid === DEFAULT_CHAT_AI_CHARACTER_UUID) || {};

            // 单人格模式只暴露当前 JSON 对应的内置角色，旧角色元数据保留在原聊天存储中但不再参与恢复。
            characters.value = [{
                ...existing,
                ...defaultCharacter,
                createdAt: Number(existing.createdAt) || defaultCharacter.createdAt
            }];
            lastActiveCharacterId.value = 0;
        };

        const chatHistory = ref([]);
        const chatSessions = ref([]);
        const currentConversationId = ref(null);
        const CHAT_RENDER_INITIAL_LIMIT = 20;
        const CHAT_RENDER_BATCH_SIZE = 10;
        const chatRenderLimit = ref(CHAT_RENDER_INITIAL_LIMIT);
        let isLoadingEarlierChatMessages = false;
        let isChatTopUnlockArmed = true;
        const lastActiveCharacterId = ref(null); // For persistence
        function hasActiveToolContinuationWork() {
            return !!(activeToolContinuationPending.value || (
                activeToolContinuationMessageId.value
                && (isGenerating.value || isRemoteGenerating.value)
            ));
        }

        const hasActiveToolInlineWork = computed(() => {
            if (activeToolHandoffPending.value || hasActiveToolContinuationWork() || activeToolQueueRunning.value) return true;
            if (!isGenerating.value && !isRemoteGenerating.value) return false;
            return chatHistory.value.some(msg => (
                msg?.role === 'assistant'
                && Array.isArray(msg.toolCalls)
                && msg.toolCalls.some(toolCall => ['receiving', 'queued', 'running'].includes(toolCall?.status))
            ));
        });
        const activeToolInlineStatusText = computed(() => {
            const processText = getActiveToolInlineProcessText();
            if (activeToolQueueRunning.value) return processText || '调用中';
            if (hasActiveToolContinuationWork()) {
                if (processText && !activeToolContinuationHasResponse.value) return processText;
                return isThinking.value ? '思考中' : '生成中';
            }
            if (activeToolHandoffPending.value || hasActiveToolInlineWork.value) return '准备中';
            return '';
        });
        const isConversationBusy = computed(() => isGenerating.value || isRemoteGenerating.value || hasActiveToolInlineWork.value);

        const presets = ref([]);
        const presetRoleOptions = [
            { value: 'system', label: '系统提示词' },
            { value: 'user', label: 'User消息' },
            { value: 'assistant', label: 'AI消息' }
        ];
        const fontFamilyOptions = [
            { value: 'modern', label: '现代通用字体' },
            { value: 'serif', label: '衬线字体' },
            { value: 'system', label: '系统字体' }
        ];
        const imageStyleOptions = [
            { value: 'vertical', label: '韩漫小清新风' },
            { value: 'comicDoujin', label: '动漫同人风' },
            { value: 'r18', label: '2.5D唯美风' },
            { value: 'lolita25d', label: '2.5D唯美风（萝）' },
            { value: 'anime', label: '本子里番风' },
            { value: 'galgame', label: 'GalGame风' },
            { value: 'custom', label: '自定义' }
        ];
        const imageSizeOptions = [
            { value: '1024x1024', label: '方图 1024x1024' },
            { value: '1024x1536', label: '竖图 1024x1536' },
            { value: '1536x1024', label: '横图 1536x1024' },
            { value: '2048x2048', label: '高清方图 2048x2048' },
            { value: '2160x3840', label: '超清竖图 2160x3840' },
            { value: '3840x2160', label: '超清横图 3840x2160' }
        ];
        const imageOutputFormatOptions = [
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' }
        ];
        const imageReasoningEffortOptions = [
            { value: 'low', label: '低' },
            { value: 'medium', label: '中' },
            { value: 'high', label: '高' }
        ];
        const imageGenCountOptions = [1, 2, 3, 4, 5, 6].map(count => ({
            value: count,
            label: `${count} 张`
        }));
        const uiTemplatePlacementOptions = [
            { value: 'top', label: '对话顶部' },
            { value: 'bottom', label: '对话底部' }
        ];
        const worldInfoPositionOptions = [
            { group: '系统提示词', value: 'system_top', label: '最顶层' },
            { group: '系统提示词', value: 'global_note', label: '全局备注' },
            { group: '系统提示词', value: 'before_char', label: '角色设定前' },
            { group: '系统提示词', value: 'after_char', label: '角色设定后' },
            { group: '对话中', value: 'at_depth', label: '按深度插入' },
            { group: '对话中', value: 'user_top', label: '用户消息顶部' },
            { group: '对话中', value: 'assistant_top', label: '助手消息顶部' }
        ];
        const presetRoleDisplayLabels = {
            system: '系统',
            user: 'User',
            assistant: 'AI'
        };
        const normalizePresetRole = (role) => (
            ['system', 'user', 'assistant'].includes(role) ? role : 'system'
        );
        const normalizePreset = (preset = {}) => ({
            ...preset,
            name: preset.name || 'New Preset',
            content: String(preset.content || ''),
            enabled: preset.enabled !== false,
            role: normalizePresetRole(preset.role || preset.presetRole || preset.type)
        });
        const getPresetRoleLabel = (preset) => {
            const role = normalizePresetRole(preset?.role);
            return presetRoleOptions.find(option => option.value === role)?.label || '系统提示词';
        };
        const getPresetRoleDisplayLabel = (preset) => {
            const role = normalizePresetRole(preset?.role);
            return presetRoleDisplayLabels[role] || '系统';
        };
        const getPresetRoleBadgeClass = (preset) => {
            const role = normalizePresetRole(preset?.role);
            if (role === 'user') return 'bg-green-100 text-green-700 border-green-200';
            if (role === 'assistant') return 'bg-purple-100 text-purple-700 border-purple-200';
            return 'bg-red-100 text-red-700 border-red-200';
        };
        const ROLE_MEMORY_VECTOR_RECALL_TAG = 'role_memory_vector_recall';
        const ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG = `<${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;
        const ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG = `</${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;
        const escapeXmlAttribute = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const escapeXmlText = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const indentXmlText = (text, spaces = 0) => {
            const prefix = ' '.repeat(Math.max(0, spaces));
            return String(text || '')
                .split(/\r?\n/)
                .map(line => `${prefix}${line}`)
                .join('\n');
        };
        const isVectorMemoryRecallContent = (content) => {
            const text = String(content || '').trimStart();
            return text.startsWith(ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG)
                || text.startsWith('[角色记忆 - 向量召回]');
        };
        const isRoleMemoryContextContent = (content) => {
            const text = String(content || '').trimStart();
            return text.startsWith('[角色记忆') || text.startsWith(ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG);
        };
        const getMessageSourceIndexes = (message, index, trackSources) => {
            const source = message?._sourceIndexes;
            if (!Array.isArray(source)) return trackSources ? [index] : [];
            const indexes = [];
            for (let i = 0; i < source.length; i++) {
                indexes.push(source[i]);
            }
            return indexes;
        };
        const getMessageImageSummary = (message) => {
            const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
            if (!attachments.length) return '';
            const label = message?.role === 'user' ? '用户提供了参考图片' : '消息包含图片';
            const names = attachments
                .map((image, index) => String(image?.name || `图片${index + 1}`).trim())
                .filter(Boolean)
                .slice(0, MAX_PENDING_REFERENCE_IMAGES)
                .join('、');
            return `[${label} ${attachments.length} 张${names ? `：${names}` : ''}。历史上下文不包含图片数据。]`;
        };

        const toPlainContextMessage = (message, index, trackSources = false) => {
            const imageSummary = getMessageImageSummary(message);
            const nextMessage = {
                role: message.role,
                name: message.name,
                content: [String(message.content || ''), imageSummary].filter(Boolean).join('\n\n')
            };
            if (message.id) nextMessage.id = message.id;
            if (Number.isFinite(message._contextFloor)) nextMessage._contextFloor = message._contextFloor;
            if (trackSources) {
                nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
            } else if (Array.isArray(message?._sourceIndexes)) {
                nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, false);
            }
            if (Array.isArray(message?._worldInfoEntries)) {
                nextMessage._worldInfoEntries = message._worldInfoEntries;
            }
            return nextMessage;
        };

        const mergeConsecutiveRoleMessages = (messages, options = {}) => {
            const {
                mergeRoles = ['user', 'assistant'],
                includeSystem = true,
                trackSources = false
            } = options;
            const mergeRoleSet = new Set(mergeRoles);
            const merged = [];
            (Array.isArray(messages) ? messages : []).forEach((message, index) => {
                if (!message || typeof message !== 'object') return;
                if (!includeSystem && message.role === 'system') return;

                const nextMessage = toPlainContextMessage(message, index, trackSources);

                const previous = merged[merged.length - 1];
                if (
                    previous
                    && previous.role === nextMessage.role
                    && mergeRoleSet.has(nextMessage.role)
                ) {
                    previous.content = [previous.content, nextMessage.content].filter(Boolean).join('\n\n');
                    if (!previous.name && nextMessage.name) previous.name = nextMessage.name;
                    if (Number.isFinite(nextMessage._contextFloor)) {
                        previous._contextFloor = Number.isFinite(previous._contextFloor)
                            ? Math.min(previous._contextFloor, nextMessage._contextFloor)
                            : nextMessage._contextFloor;
                    }
                    if (trackSources || previous._sourceIndexes || nextMessage._sourceIndexes) {
                        previous._sourceIndexes = [
                            ...(previous._sourceIndexes || []),
                            ...(nextMessage._sourceIndexes || [])
                        ];
                    }
                    if (previous._worldInfoEntries || nextMessage._worldInfoEntries) {
                        previous._worldInfoEntries = [
                            ...(previous._worldInfoEntries || []),
                            ...(nextMessage._worldInfoEntries || [])
                        ];
                    }
                    return;
                }
                merged.push(nextMessage);
            });
            return merged;
        };

        const postprocessContextMessages = (messages) => mergeConsecutiveRoleMessages(messages, {
            mergeRoles: ['user', 'assistant'],
            includeSystem: true
        });

        const getPostprocessedChatMessages = (messages = chatHistory.value, options = {}) => {
            const { includeSystem = false } = options;
            return mergeConsecutiveRoleMessages(messages, {
                mergeRoles: ['user', 'assistant'],
                includeSystem,
                trackSources: true
            });
        };

        const buildConversationTurnSnapshot = (messages = chatHistory.value, options = {}) => {
            const { includeSystem = false, alreadyPostprocessed = false } = options;
            const processedMessages = alreadyPostprocessed
                ? (Array.isArray(messages) ? messages : [])
                    .filter(message => message && typeof message === 'object' && (includeSystem || message.role !== 'system'))
                    .map((message, index) => {
                        const nextMessage = toPlainContextMessage(message, index, false);
                        nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
                        return nextMessage;
                    })
                : getPostprocessedChatMessages(messages, { includeSystem });

            const turns = [];
            let pendingUser = null;

            processedMessages.forEach((message, messageIndex) => {
                if (!message || message.role === 'system') return;

                const sourceIndexes = Array.isArray(message._sourceIndexes) ? message._sourceIndexes : [messageIndex];
                const sourceStartIndex = sourceIndexes.length ? Math.min(...sourceIndexes) : messageIndex;
                const sourceEndIndex = sourceIndexes.length ? Math.max(...sourceIndexes) : messageIndex;

                if (message.role === 'user') {
                    pendingUser = {
                        message,
                        messageIndex,
                        sourceIndexes,
                        sourceStartIndex,
                        sourceEndIndex
                    };
                    return;
                }

                if (message.role !== 'assistant' || !pendingUser) return;

                const turn = turns.length + 1;
                turns.push({
                    turn,
                    user: pendingUser.message,
                    assistant: message,
                    messages: [pendingUser.message, message],
                    messageIndexes: [pendingUser.messageIndex, messageIndex],
                    sourceIndexes: [...pendingUser.sourceIndexes, ...sourceIndexes],
                    startIndex: pendingUser.sourceStartIndex,
                    endIndex: sourceEndIndex
                });
                pendingUser = null;
            });

            return { messages: processedMessages, turns };
        };

        const getConversationTurnAtIndexFromSnapshot = (snapshot, index) => {
            if (!Number.isFinite(index) || index < 0) return null;
            const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
            const matchedTurn = turns.find(turn => (turn.sourceIndexes || []).includes(index));
            if (matchedTurn) return matchedTurn.turn;
            const previousTurns = turns.filter(turn => turn.endIndex < index).length;
            return previousTurns + 1;
        };

        const getConversationTurnAtIndex = (index) => {
            return getConversationTurnAtIndexFromSnapshot(buildConversationTurnSnapshot(), index);
        };

        const getLatestCompleteConversationTurn = () => {
            const snapshot = buildConversationTurnSnapshot();
            return snapshot.turns[snapshot.turns.length - 1] || null;
        };

        const regexScripts = ref([]);
        const globalRegexScripts = ref([]);
        const globalWorldInfo = ref([]);
        const worldInfo = ref([]);
        const globalUiTemplates = ref([]);
        const recentGenerationTimes = ref([]);
        const currentWaitTime = ref('0.0');
        let waitTimer = null;
        const longPressTimer = ref(null);
