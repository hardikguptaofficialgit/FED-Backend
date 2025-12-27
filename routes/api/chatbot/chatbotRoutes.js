/**
 * @fileoverview Chatbot API Routes
 * @module routes/api/chatbot/chatbotRoutes
 * @description Express routes for the FED Chatbot API
 */

const express = require('express');
const router = express.Router();
const { processMessage, healthCheck, sendEmail } = require('../../../controllers/chatbot');
const { optionalAuth } = require('./optionalAuth');

/**
 * @route   POST /api/chatbot/message
 * @desc    Process a chatbot message and get AI response
 * @access  Public (with optional authentication for user-specific features)
 * @body    { message: string, conversationHistory?: Array }
 */
router.post('/message', optionalAuth, processMessage);

/**
 * @route   POST /api/chatbot/send-email
 * @desc    Send email from chatbot to FED
 * @access  Public (with optional authentication for user context)
 * @body    { content: string, senderName?: string, senderEmail?: string }
 */
router.post('/send-email', optionalAuth, sendEmail);

/**
 * @route   GET /api/chatbot/health
 * @desc    Check chatbot service health
 * @access  Public
 */
router.get('/health', healthCheck);

module.exports = router;
