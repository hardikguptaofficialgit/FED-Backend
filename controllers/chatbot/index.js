/**
 * @fileoverview Chatbot Controller Exports
 * @module controllers/chatbot
 */

const { processMessage, healthCheck } = require('./chatbotController');
const { sendEmail } = require('./emailController');

module.exports = {
    processMessage,
    healthCheck,
    sendEmail
};
