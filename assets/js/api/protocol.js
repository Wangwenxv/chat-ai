(function initializeChatAIApiProtocol(global) {
    'use strict';

    // 从多个候选字段中读取非负 token 数，并统一四舍五入。
    const readUsageNumber = (...values) => {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number) && number >= 0) return Math.round(number);
        }
        return null;
    };

    // 兼容 OpenAI usage 和 Gemini usageMetadata 两类响应包装。
    const getApiUsagePayload = (data) => {
        if (data?.usage && typeof data.usage === 'object') return data.usage;
        if (data?.usageMetadata && typeof data.usageMetadata === 'object') return data.usageMetadata;
        return null;
    };

    // 从普通 JSON 或 SSE 文本中提取最后一次有效 usage。
    const extractApiUsageFromText = (rawText) => {
        try {
            return getApiUsagePayload(JSON.parse(rawText));
        } catch (_) {
            // 非普通 JSON 时继续按 SSE 行解析。
        }
        let usage = null;
        String(rawText || '').split(/\r?\n/).forEach((line) => {
            const payload = line.trim().replace(/^data:\s*/, '');
            if (!payload || payload === '[DONE]') return;
            try {
                usage = getApiUsagePayload(JSON.parse(payload)) || usage;
            } catch (_) {
                // 流中可能含注释或半截数据，跳过无法解析的行。
            }
        });
        return usage;
    };

    // 把不同供应商的 token 字段归一为应用内部统计结构。
    const normalizeApiUsage = (usage) => {
        const source = usage && typeof usage === 'object' ? usage : {};
        const promptDetails = source.prompt_tokens_details || source.input_tokens_details || {};
        const completionDetails = source.completion_tokens_details || source.output_tokens_details || {};
        const cacheReadTokens = readUsageNumber(
            promptDetails.cached_tokens,
            promptDetails.cache_read_tokens,
            source.cache_read_input_tokens,
            source.cache_read_tokens,
            source.cachedContentTokenCount,
            source.cached_content_token_count
        );
        const reportedCacheWriteTokens = readUsageNumber(
            promptDetails.cache_creation_tokens,
            promptDetails.cache_write_tokens,
            source.cache_creation_input_tokens,
            source.cache_creation_tokens,
            source.cache_write_input_tokens,
            source.cache_write_tokens
        );
        const cacheWriteTokens = reportedCacheWriteTokens ?? 0;
        const promptTokens = readUsageNumber(
            source.prompt_tokens,
            source.promptTokenCount,
            source.inputTokenCount
        );
        const nativeInputTokens = readUsageNumber(source.input_tokens);
        const inputTokens = promptTokens !== null
            ? promptTokens
            : nativeInputTokens !== null
                ? nativeInputTokens + (cacheReadTokens || 0) + cacheWriteTokens
                : null;
        const outputTokens = readUsageNumber(
            source.completion_tokens,
            source.output_tokens,
            source.candidatesTokenCount,
            source.outputTokenCount
        );
        const reasoningTokens = readUsageNumber(
            completionDetails.reasoning_tokens,
            source.reasoning_tokens,
            source.thoughtsTokenCount
        );
        let totalTokens = readUsageNumber(source.total_tokens, source.totalTokenCount);
        if (totalTokens === null && (inputTokens !== null || outputTokens !== null)) {
            totalTokens = (inputTokens || 0) + (outputTokens || 0);
        }
        const reported = [inputTokens, outputTokens, totalTokens, cacheReadTokens, reasoningTokens, reportedCacheWriteTokens]
            .some(value => value !== null);
        return { inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, reported };
    };

    // 将字符串、对象和其他错误详情转换为可展示文本。
    const stringifyErrorDetail = (detail) => {
        if (detail === null || detail === undefined) return '';
        if (typeof detail === 'string') return detail;
        try {
            return JSON.stringify(detail, null, 2);
        } catch (_) {
            return String(detail);
        }
    };

    // 从常见错误结构中选择一个数字状态码。
    const getApiErrorStatus = (payload, fallbackStatus) => {
        const candidates = [
            payload?.status,
            payload?.statusCode,
            payload?.code,
            payload?.error?.status,
            payload?.error?.statusCode,
            payload?.error?.code,
            fallbackStatus
        ];
        return candidates.find(value => (
            value !== undefined && value !== null && value !== '' && /^\d+$/.test(String(value))
        )) || '';
    };

    // 统一错误标题和详情排版，避免不同请求路径生成不同提示格式。
    const formatApiErrorMessage = (status, detail) => {
        const lines = [];
        if (status !== undefined && status !== null && status !== '') lines.push(`API Error: ${status}`);
        lines.push(stringifyErrorDetail(detail).trim() || '请求失败');
        return lines.join('\n');
    };

    // 从 OpenAI 兼容错误、普通 message/detail 中提取最终错误文本。
    const extractApiErrorMessage = (payload, fallbackStatus = '') => {
        if (!payload || typeof payload !== 'object') return '';
        const error = payload.error;
        const status = getApiErrorStatus(payload, fallbackStatus);
        if (typeof error === 'string') return formatApiErrorMessage(status, error);
        if (error && typeof error === 'object') {
            const detail = error.message || error.detail || payload.message || payload.detail || error;
            return formatApiErrorMessage(status, detail);
        }
        const detail = payload.message || payload.detail;
        return detail ? formatApiErrorMessage(status, detail) : '';
    };

    // 标记主动识别出的 API 错误，供上层和网络异常区分处理。
    const throwApiError = (message) => {
        const error = new Error(message);
        error.isApiError = true;
        throw error;
    };

    global.ChatAIApiProtocol = {
        getApiUsagePayload,
        extractApiUsageFromText,
        normalizeApiUsage,
        formatApiErrorMessage,
        extractApiErrorMessage,
        throwApiError
    };
})(window);
