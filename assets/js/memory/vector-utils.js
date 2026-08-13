(function initializeVectorMemoryUtils(global) {
    'use strict';

    // 判断值是否可以作为向量参与计算，同时兼容普通数组和 TypedArray。
    const isEmbeddingLike = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

    // 按自然断句位置拆分过长段落，无法找到合适标点时按长度硬切。
    const splitLongMemoryParagraph = (paragraph, maxLength = 1800) => {
        const text = String(paragraph || '').trim();
        if (!text) return [];
        if (text.length <= maxLength) return [text];

        const parts = [];
        let remaining = text;
        while (remaining.length > maxLength) {
            const windowText = remaining.slice(0, maxLength);
            const breakAt = Math.max(
                windowText.lastIndexOf('。'),
                windowText.lastIndexOf('！'),
                windowText.lastIndexOf('？'),
                windowText.lastIndexOf('.'),
                windowText.lastIndexOf('!'),
                windowText.lastIndexOf('?'),
                windowText.lastIndexOf('\n')
            );
            const cutAt = breakAt > Math.floor(maxLength * 0.55) ? breakAt + 1 : maxLength;
            parts.push(remaining.slice(0, cutAt).trim());
            remaining = remaining.slice(cutAt).trim();
        }
        if (remaining) parts.push(remaining);
        return parts.filter(Boolean);
    };

    // 清理多余换行并把记忆文本拆为适合嵌入的自然段。
    const splitMemoryParagraphs = (text, maxLength = 1800) => {
        const cleanText = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (!cleanText) return [];
        return cleanText
            .split(/\n\s*\n/g)
            .map(paragraph => paragraph.trim())
            .filter(Boolean)
            .flatMap(paragraph => splitLongMemoryParagraph(paragraph, maxLength));
    };

    // 在长度允许时合并短段，并保留原段落起止序号供追踪来源。
    const mergeSmallMemoryParagraphs = (paragraphs, maxLength = 400) => {
        const merged = [];
        let current = null;
        const flush = () => {
            if (!current) return;
            merged.push(current);
            current = null;
        };

        paragraphs.forEach((paragraph, index) => {
            const text = String(paragraph || '').trim();
            if (!text) return;
            const paragraphNo = index + 1;
            if (!current) {
                current = { text, start: paragraphNo, end: paragraphNo };
                return;
            }
            const candidateText = `${current.text}\n\n${text}`;
            if (candidateText.length <= maxLength) {
                current.text = candidateText;
                current.end = paragraphNo;
                return;
            }
            flush();
            current = { text, start: paragraphNo, end: paragraphNo };
        });
        flush();
        return merged;
    };

    // 将供应商返回的向量对象或数组统一转换为有限数字数组。
    const normalizeEmbedding = (embedding) => {
        const rawVector = isEmbeddingLike(embedding)
            ? embedding
            : (isEmbeddingLike(embedding?.values) ? embedding.values : []);
        return Array.from(rawVector)
            .map(value => Number(value))
            .filter(value => Number.isFinite(value));
    };

    // 计算两个向量的余弦相似度；无效或零向量返回 -1。
    const cosineSimilarity = (left, right) => {
        if (!isEmbeddingLike(left) || !isEmbeddingLike(right) || left.length === 0 || right.length === 0) return -1;
        const length = Math.min(left.length, right.length);
        let dot = 0;
        let leftNorm = 0;
        let rightNorm = 0;
        for (let index = 0; index < length; index++) {
            const leftValue = Number(left[index]) || 0;
            const rightValue = Number(right[index]) || 0;
            dot += leftValue * rightValue;
            leftNorm += leftValue * leftValue;
            rightNorm += rightValue * rightValue;
        }
        if (leftNorm === 0 || rightNorm === 0) return -1;
        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    };

    // 移除空白和常见标点，得到可用于长文本去重的稳定指纹来源。
    const normalizeVectorMemoryFingerprintText = (text) => String(text || '')
        .replace(/\s+/g, '')
        .replace(/[，。、“”‘’：；！？,.!?;:"'`~]/g, '');

    // 仅为足够长的内容生成指纹，短文本继续依赖轮次和序号区分。
    const getVectorMemoryContentFingerprint = (text) => {
        const normalized = normalizeVectorMemoryFingerprintText(text);
        return normalized.length >= 80 ? normalized.slice(0, 1000) : '';
    };

    // 从中英文查询中提取有限数量的检索词，并过滤常见停用词。
    const extractVectorQueryTerms = (text) => {
        const normalized = String(text || '')
            .replace(/[^\p{Script=Han}A-Za-z0-9_]+/gu, ' ')
            .trim();
        if (!normalized) return [];

        const stopTerms = new Set([
            '是不是', '有没有', '为什么', '怎么样', '怎么办', '什么', '这个', '那个',
            '还是', '还在', '还会', '了吗', '吗', '呢', '啊', '吧', '的', '了', '我', '你', '她', '他'
        ]);
        const terms = new Set();
        normalized.split(/\s+/).filter(Boolean).forEach((part) => {
            if (/^[A-Za-z0-9_]{2,}$/.test(part)) {
                terms.add(part.toLowerCase());
                return;
            }
            const han = part.replace(/[^\p{Script=Han}]/gu, '');
            if (han.length >= 2) {
                for (let size = Math.min(4, han.length); size >= 2; size--) {
                    for (let index = 0; index <= han.length - size; index++) {
                        const term = han.slice(index, index + size);
                        if (!stopTerms.has(term)) terms.add(term);
                    }
                }
            } else if (han.length === 1 && !stopTerms.has(han)) {
                terms.add(han);
            }
        });
        return Array.from(terms)
            .filter(term => term.length > 0 && !stopTerms.has(term))
            .sort((left, right) => right.length - left.length)
            .slice(0, 20);
    };

    // 根据查询词命中数量生成小幅词法加权，作为向量相似度的补充。
    const getVectorLexicalMatch = (memory, queryTerms) => {
        if (!queryTerms.length) return { hits: 0, boost: 0, matched: [] };
        const text = String(`${memory.sourceText || ''}\n${memory.summary || ''}`).toLowerCase();
        const matched = queryTerms.filter(term => text.includes(term.toLowerCase()));
        return {
            hits: matched.length,
            boost: Math.min(0.08, matched.length * 0.015),
            matched
        };
    };

    // 按轮次、段落序号和向量得分稳定排序记忆结果。
    const sortVectorMemoriesByTime = (items) => {
        const orderNumber = (value, fallback) => {
            if (value === null || value === undefined || value === '') return fallback;
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        };
        return [...items].sort((left, right) => {
            const turnDiff = orderNumber(left.turn, Number.MAX_SAFE_INTEGER)
                - orderNumber(right.turn, Number.MAX_SAFE_INTEGER);
            if (turnDiff !== 0) return turnDiff;
            const sequenceDiff = orderNumber(left.sequence, 0) - orderNumber(right.sequence, 0);
            if (sequenceDiff !== 0) return sequenceDiff;
            return (right.vectorScore || 0) - (left.vectorScore || 0);
        });
    };

    // 统一读取记忆正文，并为短文本补充轮次和序号以避免误判重复。
    const getVectorMemoryText = (memory) => String(
        memory?.paragraph || memory?.summary || memory?.sourceText || ''
    ).trim();
    const getVectorMemoryFingerprint = (memory) => {
        const normalized = normalizeVectorMemoryFingerprintText(getVectorMemoryText(memory));
        return normalized.length >= 80
            ? normalized.slice(0, 1000)
            : `${memory?.turn || ''}:${memory?.sequence || ''}:${normalized}`;
    };

    global.ChatAIVectorMemoryUtils = {
        isEmbeddingLike,
        splitLongMemoryParagraph,
        splitMemoryParagraphs,
        mergeSmallMemoryParagraphs,
        normalizeEmbedding,
        cosineSimilarity,
        getVectorMemoryContentFingerprint,
        extractVectorQueryTerms,
        getVectorLexicalMatch,
        sortVectorMemoriesByTime,
        getVectorMemoryText,
        getVectorMemoryFingerprint
    };
})(window);
