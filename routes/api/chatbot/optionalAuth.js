/**
 * @fileoverview Optional Authentication Middleware
 * @module routes/api/chatbot/optionalAuth
 * @description Middleware that attempts JWT auth but doesn't fail if no token
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Optional authentication middleware
 * - If valid token provided: attaches user to req.user
 * - If no token or invalid: continues without user (req.user = null)
 * - Never fails the request
 */
const optionalAuth = async (req, res, next) => {
    try {
        // Extract token from cookies or headers
        const tokenFromCookies = req.cookies?.token;
        const tokenFromHeaders = req.headers['authorization'];
        let token = tokenFromCookies || tokenFromHeaders;

        if (!token) {
            req.user = null;
            return next();
        }

        // Remove Bearer prefix if present
        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET, { maxAge: '70h' });

            const user = await prisma.user.findUnique({
                where: { email: decoded.email },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    access: true,
                    regForm: true  // Include registered events for chatbot certificate lookup
                }
            });

            req.user = user || null;
        } catch (jwtError) {
            // Token invalid or expired - continue without user
            req.user = null;
        }

        next();
    } catch (error) {
        // Any error - continue without user
        req.user = null;
        next();
    }
};

module.exports = { optionalAuth };
