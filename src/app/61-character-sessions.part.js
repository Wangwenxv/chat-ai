// 61-character-sessions.part.js：由 build-app.js 按 setup 依赖顺序组装。
const enforceSpecialRules = () => {
            const legacyRegexIndex = regexScripts.value.findIndex(script => script?.name === 'NAI画图正则');
            if (legacyRegexIndex >= 0) regexScripts.value.splice(legacyRegexIndex, 1);
            const legacyWorldInfoIndex = worldInfo.value.findIndex(entry => entry?.comment === '自动生图');
            if (legacyWorldInfoIndex >= 0) worldInfo.value.splice(legacyWorldInfoIndex, 1);
            return;
            if (SIMPLE_CHAT_AI_MODE) return;
            const imageGenToken = settings.imageGenKey.trim();
            const baseUrl = IMAGE_GEN_BASE_URL;

            // 1. NAI画图正则 (统一版本)
            const imageGenRegexName = 'NAI画图正则';
            const targetArtists = cardUtils.getImageStyleArtists(settings.imageStyle, settings.customImageArtists);

            const encodedTargetArtists = encodeURIComponent(targetArtists);
            const imageGenRegexContent = {
                name: imageGenRegexName,
                regex: '/image###([\\s\\S]*?)###/g',
                replacement: '<div style="width: auto; height: auto; max-width: 100%; box-sizing: border-box; padding: 2px; border: 1px solid rgba(255,255,255,0.58); background: rgba(255,255,255,0.32); position: relative; border-radius: 12px; overflow: hidden; display: inline-flex; justify-content: center; align-items: center; box-shadow: 0 4px 14px rgba(148,163,184,0.06);"><img src="' + baseUrl + '/generate?tag=$1&token=' + imageGenToken + '&model=nai-diffusion-4-5-full&artist=' + encodedTargetArtists + '&size=' + settings.imageSize + '&steps=40&scale=6&cfg=0&sampler=k_dpmpp_2m_sde&negative={{{{bad anatomy}}}},{bad feet},bad hands,{{{bad proportions}}},{blurry},cloned face,cropped,{{{deformed}}},{{{disfigured}}},error,{{{extra arms}}},{extra digit},{{{extra legs}}},extra limbs,{{extra limbs}},{fewer digits},{{{fused fingers}}},gross proportions,ink eyes,ink hair,jpeg artifacts,{{{{long neck}}}},low quality,{malformed limbs},{{missing arms}},{missing fingers},{{missing legs}},{{{more than 2 nipples}}},mutated hands,{{{mutation}}},normal quality,owres,{{poorly drawn face}},{{poorly drawn hands}},reen eyes,signature,text,{{too many fingers}},{{{ugly}}},username,uta,watermark,worst quality,{{{more than 2 legs}}},awkward hand sign,weird hand gesture,contorted hand,unnatural finger pose,deformed hand gesture,{shaka},{hang loose},{{rock on}},{shaka sign}&nocache=0&noise_schedule=karras"  alt="生成图片" style="max-width: 100%; height: auto; width: auto; display: block; object-fit: contain; border-radius: 9px; transition: transform 0.3s ease;"></div>',
                placement: [2],
                markdownOnly: true,
                promptOnly: false,
                scope: 'global',
                enabled: false // Default closed
            };

            // 查找当前是否已存在新命名的正则
            const newRegexIndex = regexScripts.value.findIndex(r => r.name === imageGenRegexName);

            if (newRegexIndex !== -1) {
                // 如果已存在，保留目前的启用状态并更新内容
                imageGenRegexContent.enabled = regexScripts.value[newRegexIndex].enabled;
                regexScripts.value.splice(newRegexIndex, 1);
            }

            // 添加新的到首位
            regexScripts.value.unshift(imageGenRegexContent);

            // 2. 自动生图世界书
            const autoImageGenWIName = '自动生图';
            const imageGenCount = Math.min(6, Math.max(1, Number(settings.imageGenCount) || 2));
            const autoImageGenWIContent = {
                comment: autoImageGenWIName,
                keys: [],
                content: `<auto_image_gen>\n用户已开启自动生图。每次回复的正文中必须在合适的位置穿插图片，标准格式为：image###生成的提示词###，不能只输出文字正文；本轮必须生成${imageGenCount}张图片。
使用绘画tag对场景人物进行特写，并保证一个场景拥有${imageGenCount}张图。
注意:始终使用逗号分隔条目.另外请保证同一角色的特征，如发色，瞳孔颜色，体态，外貌的一致性.
使用 image###生成的提示词### 的格式！
注意：如为nsfw场景，生成的提示词必须带上 nsfw 标签；如果是同人/已有作品角色，角色名仍必须放在最前面，nsfw 紧跟其后。

###提示词生成指导:
第一重要的在于人物的特点,例如：white hair,性别：1girl,1boy,特色：mesugaki,ojousama,服装特色：china_dress,gothic,glasses,表情动作：smile,crying,tearing_clothes,disgust,angry,kubrick_stare,
第二在于人物姿势：例如基础的站姿：standing,on back,on stomach,kneeling,做事情：bathing,cooking,fighting,showering,sleeping,spitting,walking,toilet_use,性爱姿势：grinding,fingering,licking_penis,
第三在于动作细节:例如hands_on_own_chest,arms_behind_back,penis_grab,pulled_by_self,skirt_pull,clothes_lift,covering_chest_by_hand,finger_to_mouth,hands_on_lap,
第四在于环境交互：例如：grinding,fingering,licking_penis,spread legs,wariza,sitting_in_tree,lotus_position,sitting_on_rock,sitting_on_stairs,folded,cameltoe,
第五在于衣物细节:例如XX半脱，露出XX
第六在于镜头描写，从XX往XX看，上半身还是下半身，例如从下往上的下半身，从上往下的上半身.lower_body,between_legs,between_breasts,pantyshot,looking_at_viewer,
第七在于人物此时的位置，例如: diningroom, gym, bedroom, indoors, home, beach
第八在于当前时间,morning, noon ，night, emphasize the lighting situation..

<Tag_注意事项>
#  Tag规范：禁用中文；原创角色禁止使用人物卡英文名；同人/已有作品角色必须把官方英文名或常用角色Tag放在提示词最前面
1. 拆解复合词：【如：月下→moonlight,night】
2. 排除元素：“no+Tag”明确强调排除，默认绘图“不提及也易生成”的元素【如：穿衣但不穿胸罩→no bra；穿短裙但不穿内裤→no panties】

# 画面限制：仅描述画面中“客观存在的人/物/背景及正在发生的物理动作“，严禁加入人物内心想法、回忆、幻想、预告、计划，及比喻、抽象描述等非视觉化内容
【如：构图变化：全身→仅下半身→移除"shirt, expression"等上半身Tag】
【如：人物视线：正面→背对→移除"eye color"等面部Tag→再添加：from behind】
【如：遮挡视线：脸庞遮盖/蒙眼→移除"eye color"等眼部Tag，添加：face covered/blindfold】
【如：对话转动作：“你看，我今天穿内裤了。”→撩裙子,可见内裤→lifting skirt,panties】
</Tag_注意事项>

角色描述 以Character 1 Prompt为示例
身份：
 - 主体标识：【如：girl、boy、other】
 - 同人角色：提示词第一项必须是英文全名\\\\(作品名\\\\)或常用角色Tag（下划线_替换成空格，/转义为\\\\），再接外貌、服装、动作等Tag
 - 原创角色：名字替换为"original"(也就是人物卡角色)
特征：
 - 基础特征：发型、发色、瞳色、罩杯
 - 专属特征：年龄、职业、性格、皮肤、种族等
**特征根据场景和图片的构图智能调整,冲突则临时移除**
- 互动动作&细节：
  - 自身【如：hands on own ass、grab own ass、arms behind back、covering chest by hand】
  - 对方【如：hand on others' chest 、grabbing another's hair 、penis grab、covering another's eyes、princess carry】
  - 物品【如：holding doorknob、clothes lift、sex toy on floor、bowl in front of girl、dildo in mouth】
  - 环境【如：partially submerged】
**同步/非同步：【如：双手举高→raising hands；单手举高→raising hand, hand in pocket】**
表情:
 - 视线：【如：looking at viewer】
 - 面部：【如：open mouth】
 - 表情：【如：smile、blush】
 - 生理反应：【wet、pussy juice、cum、dripping】

<Tag_智能调整>
# 个数分配：按”画面视觉占比及焦点”分配动态不同分类的Tag个数

# 排序调整：按”画面视觉占比及焦点”从高到低排序；并将同分类逻辑关联的Tag相邻排列，避免分散

# 权重调整：
1. 增强权重：{Tag}
 - 功能：突出核心Tag，最多叠加6层（1层≈1.1倍、2层≈1.21倍、6层≈1.77倍）
 - 分配优先级：特征>动作>服饰>表情>特效【如：红发→{{{red hair}}}】
 - 涉及人物特征(如发色，瞳孔颜色等）的提示词请增加权重
2. 减弱权重：[Tag]
 - 功能：弱化次要Tag或调整幅度，最多叠加2层（1层≈0.9倍、2层≈0.8倍）
 - 分配优先级：调整幅度【如：背景有 “花瓶”→但无需突出→[vase]】

 ### 核心一致性规范 (极其重要):
1. **上下文一致性**：必须精准提取并保留角色当前的外貌，着装状态（如衣服是否破损、脱下）、环境光影、道具位置以及相对姿势。一旦在上文改变了状态，后续生图Tag必须绝对保持一致！
2. **同人角色/固定外观一致性**：对于特定世界观或同人角色，提示词最前面必须放官方英文名或常用角色Tag，并带上极其准确的专属特征Tag组合。对常驻特征（如特定发型、异色瞳、专属装饰物等）加上最高权重 {{{Tag}}}，避免生成外形崩坏和不一致。

<生成格式>
image###生成的提示词###
</生成格式>
</Tag_智能调整>

特别提示：出现user或主角参与的情况(如被口、手交），禁止出现主角的人物形象(脸部，头部）！必须使用第一视角(POV）相关提示词！且要作为Character  Prompt添加，禁止出现用户/主角名字(包括英文和拼音），中文和{{user}}是明令禁止的；同人角色本人的官方角色名仍按上方规则放在最前面。一定要保持同一人物在上下文中的形象一致性，不要丢失人物特性(如有异色瞳特征人物），涉及人物常见特征(如发色，瞳孔颜色等）的提示词请增加权重\n</auto_image_gen>`,
                constant: true,
                enabled: false, // Default closed
                scope: 'global',
                position: 'at_depth',
                depth: 4,
                order: 100,
                useProbability: false,
                probability: 100
            };

            const wiIndex = worldInfo.value.findIndex(w => w.comment === autoImageGenWIName);
            if (wiIndex !== -1) {
                // 存在，保留启用状态并更新内容
                autoImageGenWIContent.enabled = worldInfo.value[wiIndex].enabled;
                worldInfo.value.splice(wiIndex, 1);
            }
            // 添加新的到首位
            worldInfo.value.unshift(autoImageGenWIContent);

        };

        watch(() => settings.imageGenKey, () => {
            enforceSpecialRules();
            if (isAutoImageGenEnabled.value) {
                updateImageGenRegexState({ enableRegex: true });
            }
            saveData();
            fetchQuota();
        });

        const prepareLoadedChatHistoryForDisplay = (messages = []) => messages
            .filter(msg => msg !== null && msg !== undefined)
            .map(msg => {
                if (msg.isSelf === undefined) {
                    msg.isSelf = msg.role === 'user';
                }
                if (msg.role === 'user' || msg.role === 'assistant') {
                    delete msg.skipReveal;
                    msg.shouldAnimate = true;
                }
                if (msg.role === 'assistant' && msg.isSummaryOpen === undefined && hasThinkingOrTools(msg)) {
                    msg.isSummaryOpen = false;
                }
                if (msg.imageGeneration && ['connecting', 'generating'].includes(msg.imageGeneration.status)) {
                    msg.imageGeneration.status = 'cancelled';
                    msg.imageGeneration.label = '页面刷新，生成已中止';
                    msg.content = msg.content || '生图已中止';
                }
                return msg;
            });

        const createInitialChatHistory = (char) => char?.first_mes ? [{
            role: 'assistant',
            name: char.name,
            content: replaceCharacterCardMacros(char.first_mes, char)
        }] : [];

        const normalizeStoredChatMessages = (savedChat, char) => {
            if (savedChat === undefined) return createInitialChatHistory(char);
            if (!Array.isArray(savedChat)) {
                throw new TypeError('保存的聊天记录格式不是数组');
            }
            if (savedChat.some(message => message !== null && (typeof message !== 'object' || Array.isArray(message)))) {
                throw new TypeError('保存的聊天记录包含无效消息');
            }
            return savedChat.length > 0
                ? prepareLoadedChatHistoryForDisplay(savedChat)
                : createInitialChatHistory(char);
        };

        const getStoredChatHistoryWithRetry = async (id) => {
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    return await getScopedStoredValue('chat', id);
                } catch (error) {
                    lastError = error;
                    if (attempt === 3 || !isRetryableChatStorageError(error)) throw error;
                    await new Promise(resolve => setTimeout(resolve, attempt * 250));
                }
            }
            throw lastError;
        };

        const getStoredChatSessionWithRetry = async (characterId, sessionId) => {
            const scopeId = getConversationStorageScopeId(characterId, sessionId);
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    return await getScopedStoredValue('chat_session', scopeId);
                } catch (error) {
                    lastError = error;
                    if (attempt === 3 || !isRetryableChatStorageError(error)) throw error;
                    await new Promise(resolve => setTimeout(resolve, attempt * 250));
                }
            }
            throw lastError;
        };

        const loadLegacyChatHistoryForCharacter = async (char, fallbackIndex = null) => {
            let savedChat = char.uuid ? await getStoredChatHistoryWithRetry(char.uuid) : undefined;
            let legacyIndexKey = null;
            if (savedChat === undefined && Number.isInteger(fallbackIndex)) {
                savedChat = await getStoredChatHistoryWithRetry(fallbackIndex);
                if (savedChat !== undefined) legacyIndexKey = fallbackIndex;
            }
            return {
                found: savedChat !== undefined,
                legacyIndexKey,
                messages: normalizeStoredChatMessages(savedChat, char)
            };
        };

        const loadChatSessionsStateForCharacter = async (char, fallbackIndex = null) => {
            const storedState = await getScopedStoredValue('chat_sessions', char.uuid);
            let state = normalizeChatSessionState(storedState, char);
            let shouldSaveState = false;

            if (state.sessions.length === 0) {
                // URL 指定的内置人格拥有独立会话，禁止把旧索引 0 的 chat-ai 历史迁移到新人格。
                const legacyFallbackIndex = char?.isBuiltinChatAi ? null : fallbackIndex;
                const legacy = await loadLegacyChatHistoryForCharacter(char, legacyFallbackIndex);
                const session = buildChatSessionMeta({
                    id: generateUUID(),
                    createdAt: char.createdAt || Date.now(),
                    updatedAt: Date.now(),
                    legacy: true
                }, legacy.messages, char);
                state = {
                    activeId: session.id,
                    sessions: [session]
                };
                await setScopedStoredValue(
                    'chat_session',
                    getConversationStorageScopeId(char.uuid, session.id),
                    cloneForStorage(legacy.messages),
                    { clone: false }
                );
                shouldSaveState = true;
                if (legacy.found) {
                    await Promise.allSettled([
                        deleteScopedStoredValue('chat', char.uuid),
                        legacy.legacyIndexKey !== null ? deleteScopedStoredValue('chat', legacy.legacyIndexKey) : Promise.resolve()
                    ]);
                }
            }

            if (!state.activeId || !state.sessions.some(session => session.id === state.activeId)) {
                state.activeId = state.sessions[0]?.id || null;
                shouldSaveState = true;
            }

            if (shouldSaveState) {
                await setChatSessionsStateForCharacterId(char.uuid, state);
            }

            return state;
        };

        const loadStoredChatHistory = async (char, fallbackIndex = null, sessionId = null) => {
            if (sessionId && char.uuid) {
                const savedSessionChat = await getStoredChatSessionWithRetry(char.uuid, sessionId);
                if (savedSessionChat !== undefined) {
                    return normalizeStoredChatMessages(savedSessionChat, char);
                }
            }
            return (await loadLegacyChatHistoryForCharacter(char, fallbackIndex)).messages;
        };

        const DEFAULT_USER_REGEX_NAME = 'Auto Replace {{user}}';
        const createDefaultUserRegex = () => ({
            name: DEFAULT_USER_REGEX_NAME,
            regex: '{{user}}',
            flags: 'gi',
            replacement: user.name,
            placement: [1, 2],
            markdownOnly: false,
            promptOnly: false,
            scope: 'global',
            enabled: true
        });
        const ensureDefaultUserRegex = ({ prepend = false } = {}) => {
            if (SIMPLE_CHAT_AI_MODE) return;
            const script = regexScripts.value.find(item => item.name === DEFAULT_USER_REGEX_NAME);
            if (script) {
                script.replacement = user.name;
                script.enabled = true;
                script.scope = 'global';
                if (!script.placement) script.placement = [1, 2];
                return;
            }
            regexScripts.value[prepend ? 'unshift' : 'push'](createDefaultUserRegex());
        };

        const loadCharacterMemories = async (characterId, errorContext = '') => {
            const memoryScopeId = getActiveConversationMemoryScopeId(characterId);
            const activeSession = chatSessions.value.find(session => session.id === currentConversationId.value);
            try {
                let savedMemories = memoryScopeId ? await getScopedStoredValue('memories', memoryScopeId) : undefined;
                if (savedMemories === undefined && activeSession?.legacy) {
                    savedMemories = await getScopedStoredValue('memories', characterId);
                }
                memories.value = savedMemories?.length
                    ? prepareMemoriesForRuntime(savedMemories)
                    : [];
            } catch (error) {
                console.error(`Error loading memories${errorContext}:`, error);
                memories.value = [];
            }
            _memoriesLoaded = true;

            _classicMemoriesLoaded = false;
            try {
                let savedMemories = memoryScopeId ? await getScopedStoredValue('classic_memories', memoryScopeId) : undefined;
                if (savedMemories === undefined && activeSession?.legacy) {
                    savedMemories = await getScopedStoredValue('classic_memories', characterId);
                }
                classicMemories.value = prepareClassicMemoriesForRuntime(savedMemories);
                _classicMemoriesLoaded = true;
            } catch (error) {
                console.error(`Error loading classic memories${errorContext}:`, error);
                classicMemories.value = [];
            }
            if (memorySettings.enabled
                && (memorySettings.mode !== MEMORY_MODE_CLASSIC || _classicMemoriesLoaded)) {
                nextTick(() => startAutomaticMemoryPatrol());
            }
        };

        const selectCharacter = async (index, isNewImport = false) => {
            if (isConversationBusy.value) {
                stopGeneration();
                const stopped = await waitForConversationIdle();
                await saveChatHistoryNow();
                if (!stopped) {
                    showToast('正在停止生成，请稍后再切换角色卡', 'warning');
                    return;
                }
            }
            await flushPendingChatHistorySave();
            await saveMemoriesNow();
            await saveClassicMemoriesNow();
            abortUiTemplateUpdate();
            const previousCharacterIndex = currentCharacterIndex.value;
            const previousCharacter = currentCharacter.value;
            if (previousCharacterIndex !== index) {
                abortVectorBatchExtraction();
                abortClassicBatchExtraction();
            }
            const char = characters.value[index];
            if (!char) {
                showToast('角色不存在，无法读取聊天记录', 'error');
                return;
            }

            let loadedChatHistory;
            let sessionState;
            try {
                if (!char.uuid) {
                    char.uuid = generateUUID();
                    await initDB();
                    await setStoredValue('characters', characters.value);
                }
                sessionState = await loadChatSessionsStateForCharacter(char, index);
                loadedChatHistory = await loadStoredChatHistory(char, index, sessionState.activeId);
            } catch (error) {
                console.error('Error loading chat history:', error);
                showToast('聊天记录读取失败，已保留当前会话且不会覆盖原记录，请稍后重试', 'error', 5000);
                return;
            }

            _isApplyingCharacterScopedData = true;
            if (previousCharacterIndex !== -1 && previousCharacterIndex !== index) {
                saveGlobalUiTemplateRuntimeForCharacter(previousCharacter);
            }
            currentCharacterIndex.value = index;
            currentConversationId.value = sessionState.activeId;
            chatSessions.value = sessionState.sessions;
            resetChatRenderWindow();
            normalizeCharacterUiTemplates(char);
            if (previousCharacterIndex !== index) {
                loadGlobalUiTemplateRuntimeForCharacter(char);
            }
            chatHistory.value = loadedChatHistory;

            // Load Character Specific Data
            worldInfo.value = getCombinedWorldInfo(char);

            combineRegexScriptsForCharacter(char);
            finishApplyingCharacterScopedData();

            if (char.recentGenerationTimes) {
                recentGenerationTimes.value = JSON.parse(JSON.stringify(char.recentGenerationTimes));
            } else {
                recentGenerationTimes.value = [];
            }

            ensureDefaultUserRegex();



            // Enforce special rules (Nai画图正则 & 自动生图)
            enforceSpecialRules();

            // Sync image style rules
            if (isAutoImageGenEnabled.value) {
                const messages = updateImageGenRegexState({ enableRegex: true });
                if (messages && messages.length > 0) {
                    showToast('已同步生图风格：' + messages.join('，'), 'success');
                }
            }

            await loadCharacterMemories(char.uuid);

            // 角色管理页完成切换后回到聊天页；聊天页内切换时保持当前实例。
            if (currentView.value !== 'chat') {
                await saveData();
                window.ChatAINavigation?.open('chat');
                return;
            }
            await scrollChatToBottom();
            showToast(`已切换到角色: ${char.name}`, 'success');

            saveData(); // Save the switch immediately
        };

        const prepareForChatSessionSwitch = async () => {
            if (isConversationBusy.value) {
                stopGeneration();
                const stopped = await waitForConversationIdle();
                await saveChatHistoryNow();
                if (!stopped) {
                    showToast('正在停止生成，请稍后再切换对话', 'warning');
                    return false;
                }
            }
            await flushPendingChatHistorySave();
            await saveMemoriesNow();
            await saveClassicMemoriesNow();
            saveGlobalUiTemplateRuntimeForCharacter();
            abortUiTemplateUpdate();
            abortVectorBatchExtraction();
            abortClassicBatchExtraction();
            return true;
        };

        const applyChatSessionToView = async (char, sessionId, loadedHistory) => {
            _isApplyingCharacterScopedData = true;
            currentConversationId.value = sessionId;
            resetChatRenderWindow();
            chatHistory.value = loadedHistory;
            loadGlobalUiTemplateRuntimeForCharacter(char);
            memories.value = [];
            classicMemories.value = [];
            _memoriesLoaded = false;
            _classicMemoriesLoaded = false;
            finishApplyingCharacterScopedData();
            await loadCharacterMemories(char.uuid);
            closeMobileMenu();
            await scrollChatToBottom();
        };

        const createChatSession = async () => {
            const char = currentCharacter.value;
            if (!char?.uuid) {
                window.ChatAINavigation?.open('characters');
                closeMobileMenu();
                showToast('请先选择一个角色卡', 'warning');
                return;
            }
            const ready = await prepareForChatSessionSwitch();
            if (!ready) return;

            const now = Date.now();
            const session = buildChatSessionMeta({
                id: generateUUID(),
                createdAt: now,
                updatedAt: now
            }, createInitialChatHistory(char), char);
            const initialHistory = createInitialChatHistory(char);
            chatSessions.value = sortChatSessions([session, ...chatSessions.value]);
            await applyChatSessionToView(char, session.id, initialHistory);
            await saveChatHistoryNow();
            showToast('已新建对话', 'success');
        };

        const selectChatSession = async (sessionId) => {
            const char = currentCharacter.value;
            if (!char?.uuid || !sessionId) return;
            const session = chatSessions.value.find(item => item.id === sessionId);
            if (!session) {
                showToast('历史对话不存在', 'warning');
                return;
            }
            if (sessionId === currentConversationId.value) {
                closeMobileMenu();
                await scrollChatToBottom();
                return;
            }

            const ready = await prepareForChatSessionSwitch();
            if (!ready) return;

            try {
                const loadedHistory = await loadStoredChatHistory(char, currentCharacterIndex.value, sessionId);
                await applyChatSessionToView(char, sessionId, loadedHistory);
                await saveCurrentChatSessionsState(char.uuid);
                showToast('已切换历史对话', 'success');
            } catch (error) {
                console.error('Error switching chat session:', error);
                showToast('历史对话读取失败，已保留当前会话', 'error', 5000);
            }
        };

        const deleteChatSession = (sessionId) => {
            const char = currentCharacter.value;
            if (!char?.uuid || !sessionId) return;
            if (chatSessions.value.length <= 1) {
                showToast('至少保留一个对话', 'warning');
                return;
            }

            confirmAction('确定要删除这个历史对话吗？该对话的聊天记录、记忆和变量记录都会删除。', async () => {
                const deletingActive = sessionId === currentConversationId.value;
                if (deletingActive) {
                    const ready = await prepareForChatSessionSwitch();
                    if (!ready) return;
                }

                await deleteConversationScopedData(char, sessionId);
                const remainingSessions = sortChatSessions(chatSessions.value.filter(session => session.id !== sessionId));
                chatSessions.value = remainingSessions;

                if (deletingActive) {
                    const nextSession = remainingSessions[0];
                    if (nextSession) {
                        const loadedHistory = await loadStoredChatHistory(char, currentCharacterIndex.value, nextSession.id);
                        await applyChatSessionToView(char, nextSession.id, loadedHistory);
                    }
                }

                await saveCurrentChatSessionsState(char.uuid);
                await setStoredValue('characters', characters.value);
                await setStoredValue('global_ui_templates', globalUiTemplates.value);
                await saveMemorySettingsNow();
                showToast('历史对话已删除', 'success');
            });
        };

        const handleAvatarUpload = (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        editingCharacter.data.avatar = await compressImage(e.target.result, 400, 0.8);
                    } catch (err) {
                        editingCharacter.data.avatar = e.target.result;
                    }
                };
                reader.readAsDataURL(file);
            }
        };
