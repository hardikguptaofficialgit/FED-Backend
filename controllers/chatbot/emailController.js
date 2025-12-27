/**
 * @fileoverview Email Sending Controller for Chatbot
 * @module controllers/chatbot/emailController
 * @description Handles sending emails from chatbot to FED
 */

const expressAsyncHandler = require('express-async-handler');
const mailTransporters = require('../../config/nodeMailer');

/**
 * Send email from chatbot
 * @route POST /api/chatbot/send-email
 * @access Public (with optional auth for user context)
 */
const sendEmail = expressAsyncHandler(async (req, res) => {
    const { content, senderName, senderEmail } = req.body;

    if (!content || content.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Email content is required'
        });
    }

    // Use authenticated user if available, otherwise use provided info
    const user = req.user;
    const userName = user?.name || senderName || 'Anonymous User';
    const userEmail = user?.email || senderEmail || 'Not provided';

    const subject = `${userName} wants to ask`;

    // Email content with user info
    const emailBody = `
Message from FED Website Chatbot
================================

From: ${userName}
Email: ${userEmail}

Message:
${content}

================================
This email was sent via the FED Chatbot.
`;

    try {
        await mailTransporters.primary.sendMail({
            from: process.env.MAIL_USER,
            to: 'fedkiit@gmail.com',
            subject: subject,
            text: emailBody,
            replyTo: userEmail !== 'Not provided' ? userEmail : undefined
        });

        console.log(`[Chatbot Email] Email sent from ${userName} (${userEmail})`);

        return res.status(200).json({
            success: true,
            message: 'Email sent successfully! The FED team will get back to you soon.'
        });
    } catch (error) {
        console.error('[Chatbot Email] Error sending email:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send email. Please try again later.'
        });
    }
});

module.exports = { sendEmail };
