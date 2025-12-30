/**
 * @fileoverview Gemini AI Service for FED Chatbot
 * @module controllers/chatbot/geminiService
 * @description Handles all Gemini API interactions securely on the backend
 * with retry logic, rate limit handling, and API key rotation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Load all available API keys from environment
 * Filters out placeholder values
 */
const loadApiKeys = () => {
    const keys = [];
    for (let i = 1; i <= 10; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key && !key.includes('YOUR_API_KEY') && key.length > 10) {
            keys.push(key);
        }
    }
    // Fallback to old single key format if no numbered keys found
    if (keys.length === 0 && process.env.GEMINI_API_KEY) {
        keys.push(process.env.GEMINI_API_KEY);
    }
    console.log(`[Gemini Service] Loaded ${keys.length} API key(s) for rotation`);
    return keys;
};

const API_KEYS = loadApiKeys();
let currentKeyIndex = 0;

/**
 * Get current API key and rotate to next on failure
 */
const getCurrentKey = () => API_KEYS[currentKeyIndex];
const rotateToNextKey = () => {
    const previousIndex = currentKeyIndex;
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[Gemini Service] Rotating API key: ${previousIndex + 1} -> ${currentKeyIndex + 1}`);
    return currentKeyIndex !== previousIndex; // Returns false if we've cycled through all keys
};

/**
 * Create a new Gemini AI client with the specified key
 */
const createClient = (apiKey) => {
    return new GoogleGenerativeAI(apiKey, { apiVersion: 'v1' });
};

/**
 * Configuration for Gemini model
 */
const MODEL_CONFIG = {
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048,
    },
};

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
    maxRetries: 2,  // Retries per key
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
};

/**
 * Rate limit tracking
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 500; // Minimum 500ms between requests

/**
 * Sleep helper function
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay for exponential backoff
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
const getBackoffDelay = (attempt) => {
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
};

/**
 * Check if error is retryable (rate limit or temporary server error)
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error is retryable
 */
const isRetryableError = (error) => {
    const errorMessage = error.message || '';
    const statusCode = error.status || error.statusCode || 0;

    // Rate limit errors (429)
    if (statusCode === 429 || errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        return true;
    }

    // Server errors (5xx)
    if (statusCode >= 500 && statusCode < 600) {
        return true;
    }

    // Quota exceeded
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
        return true;
    }

    return false;
};

/**
 * Extract retry delay from error if provided
 * @param {Error} error - The error object
 * @returns {number|null} Suggested delay in ms, or null
 */
const getRetryDelayFromError = (error) => {
    try {
        if (error.errorDetails) {
            const retryInfo = error.errorDetails.find(d => d['@type']?.includes('RetryInfo'));
            if (retryInfo && retryInfo.retryDelay) {
                // Parse "4s" or "4.5s" format
                const match = retryInfo.retryDelay.match(/(\d+\.?\d*)/);
                if (match) {
                    return Math.ceil(parseFloat(match[1]) * 1000);
                }
            }
        }
    } catch (e) {
        // Ignore parsing errors
    }
    return null;
};

/**
 * Generate AI response using Gemini with retry logic and key rotation
 * @param {string} systemPrompt - The system instruction prompt
 * @param {string} userMessage - User's message
 * @param {Array} conversationHistory - Optional conversation history
 * @returns {Promise<string>} AI generated response
 */
const generateResponse = async (systemPrompt, userMessage, conversationHistory = []) => {
    let lastError = null;
    const startingKeyIndex = currentKeyIndex;
    let keysTriedCount = 0;

    // Rate limiting: ensure minimum interval between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest);
    }

    // Try each API key until one works
    while (keysTriedCount < API_KEYS.length) {
        const currentKey = getCurrentKey();
        console.log(`[Gemini Service] Using API key ${currentKeyIndex + 1}/${API_KEYS.length}`);

        for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
            try {
                lastRequestTime = Date.now();

                console.log(`[Gemini Service] Key ${currentKeyIndex + 1}, Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`);

                const genAI = createClient(currentKey);
                const model = genAI.getGenerativeModel({
                    model: MODEL_CONFIG.model,
                    systemInstruction: systemPrompt,
                });

                // Build chat history for context
                let history = conversationHistory.map(msg => {
                    const role = msg.role || (msg.isUser ? 'user' : 'model');
                    const text = msg.content || msg.text || '';
                    return {
                        role: role,
                        parts: [{ text: text }],
                    };
                });

                // Filter out any leading 'model' messages
                while (history.length > 0 && history[0].role === 'model') {
                    history.shift();
                }

                const chat = model.startChat({
                    history,
                    generationConfig: MODEL_CONFIG.generationConfig,
                });

                const result = await chat.sendMessage(userMessage);
                const response = result.response.text();

                console.log(`[Gemini Service] Response generated successfully with key ${currentKeyIndex + 1}`);
                return response;

            } catch (error) {
                lastError = error;
                console.error(`[Gemini Service] Key ${currentKeyIndex + 1}, Attempt ${attempt + 1} failed:`, error.message);

                // If rate limited or quota exceeded, try next key immediately
                if (isRetryableError(error) && error.message?.includes('429')) {
                    console.log(`[Gemini Service] Rate limit hit on key ${currentKeyIndex + 1}, rotating to next key...`);
                    break; // Exit retry loop to try next key
                }

                // For other retryable errors, retry with same key
                if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(error)) {
                    const errorDelay = getRetryDelayFromError(error);
                    const backoffDelay = getBackoffDelay(attempt);
                    const delayMs = errorDelay || backoffDelay;

                    console.log(`[Gemini Service] Retrying in ${delayMs}ms...`);
                    await sleep(delayMs);
                }
            }
        }

        // Move to next key
        keysTriedCount++;
        if (keysTriedCount < API_KEYS.length) {
            rotateToNextKey();
        }
    }

    // All keys and retries exhausted
    console.error('[Gemini Service] All API keys and retry attempts exhausted');
    throw new Error(`Gemini API Error: ${lastError?.message || 'All API keys exhausted'}`);
};

/**
 * Check Gemini API health/connectivity
 * @returns {Promise<boolean>} True if connected
 */
const checkHealth = async () => {
    try {
        const genAI = createClient(getCurrentKey());
        const model = genAI.getGenerativeModel({ model: MODEL_CONFIG.model });
        await model.generateContent('ping');
        return true;
    } catch (error) {
        console.error('[Gemini Service] Health check failed:', error.message);
        return false;
    }
};

module.exports = {
    generateResponse,
    checkHealth,
};
