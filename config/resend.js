// config/resend.js
const { Resend } = require('resend');

// Initialize Resend with API key from environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = { resend };
