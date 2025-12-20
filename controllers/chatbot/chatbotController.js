/**
 * @fileoverview Chatbot Controller for FED
 * @module controllers/chatbot/chatbotController
 * @description Main controller handling chatbot message processing
 */

const { PrismaClient, AccessTypes } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateResponse, checkHealth } = require('./geminiService');
const { buildPrompt, buildMessageWithContext, requiresAuth } = require('./promptBuilder');

/**
 * Fetch team members from database
 * @returns {Promise<Array>} Team members data
 */
const fetchTeamData = async () => {
    try {
        const users = await prisma.user.findMany({
            where: {
                access: {
                    notIn: [AccessTypes.USER, AccessTypes.ADMIN]
                }
            },
            select: {
                id: true,
                name: true,
                access: true,
                img: true,
                extra: true
            }
        });
        return users;
    } catch (error) {
        console.error('[Chatbot Controller] Error fetching team:', error);
        return [];
    }
};

/**
 * Fetch events from database
 * @returns {Promise<Object>} Events data with ongoing and past arrays
 */
const fetchEventsData = async () => {
    try {
        // Fetch ALL forms (same as getAllForms endpoint - no DB-level filtering)
        // JSON field filtering must be done in JavaScript, not Prisma
        const forms = await prisma.form.findMany({});

        console.log(`[Chatbot Controller] Raw forms fetched: ${forms.length}`);

        const ongoingEvents = [];
        const pastEvents = [];

        forms.forEach(form => {
            // Must have info object and be public (filter in JS, not Prisma)
            if (form.info && form.info.isPublic === true) {
                // Build event data object matching frontend structure
                const eventData = {
                    id: form.id,
                    eventTitle: form.info.eventTitle || 'Untitled Event',
                    eventDate: form.info.eventDate,
                    eventDescription: form.info.eventDescription || '',
                    eventVenue: form.info.eventVenue || null,
                    eventTime: form.info.eventTime || null,
                    eventImg: form.info.eventImg || null,
                    eventPriority: parseInt(form.info.eventPriority, 10) || 999,
                    registrationLink: form.info.registrationLink || null,
                    isRegistrationClosed: form.info.isRegistrationClosed || false,
                    isEventPast: form.info.isEventPast || false,
                    relatedEvent: form.info.relatedEvent || null
                };

                // Categorize based on isEventPast flag (matching frontend logic)
                if (!form.info.isEventPast) {
                    ongoingEvents.push(eventData);
                } else {
                    pastEvents.push(eventData);
                }
            }
        });

        // Sort ongoing events by priority first, then date, then title (matching frontend)
        ongoingEvents.sort((a, b) => {
            // Compare by priority (lower number = higher priority)
            if (a.eventPriority !== b.eventPriority) {
                return a.eventPriority - b.eventPriority;
            }
            // If same priority, compare by date (earliest first)
            const dateA = new Date(a.eventDate);
            const dateB = new Date(b.eventDate);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA - dateB;
            }
            // If same date, compare alphabetically
            return (a.eventTitle || '').localeCompare(b.eventTitle || '');
        });

        // Sort past events by date (most recent first)
        pastEvents.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));

        console.log(`[Chatbot Controller] Filtered: ${ongoingEvents.length} ongoing events, ${pastEvents.length} past events`);

        return { ongoingEvents, pastEvents };
    } catch (error) {
        console.error('[Chatbot Controller] Error fetching events:', error);
        return { ongoingEvents: [], pastEvents: [] };
    }
};

/**
 * Fetch blogs from database
 * @returns {Promise<Array>} Blogs data
 */
const fetchBlogsData = async () => {
    try {
        const blogs = await prisma.blog.findMany({
            where: {
                visibility: 'public'
            },
            select: {
                id: true,
                title: true,
                author: true,
                category: true,
                desc: true,
                date: true,
                blogLink: true,
                summary: true
            }
        });

        // Sort by date (most recent first)
        blogs.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log(`[Chatbot Controller] Fetched ${blogs.length} public blogs`);
        return blogs;
    } catch (error) {
        console.error('[Chatbot Controller] Error fetching blogs:', error);
        return [];
    }
};

/**
 * Fetch user certificates if authenticated
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} User's certificates with event details
 */
const fetchUserCertificates = async (userEmail) => {
    try {
        const certificates = await prisma.issuedCertificates.findMany({
            where: {
                email: userEmail
            },
            include: {
                event: {
                    select: {
                        name: true,
                        description: true
                    }
                }
            }
        });

        // Map to friendly format
        const formattedCerts = certificates.map(cert => ({
            id: cert.id,
            eventName: cert.event?.name || 'Unknown Event',
            eventDescription: cert.event?.description || '',
            mailed: cert.mailed,
            imageSrc: cert.imageSrc
        }));

        console.log(`[Chatbot Controller] Fetched ${formattedCerts.length} certificates for ${userEmail}`);
        return formattedCerts;
    } catch (error) {
        console.error('[Chatbot Controller] Error fetching certificates:', error);
        return [];
    }
};

/**
 * Fetch user's registered events
 * @param {Array} eventIds - Array of event/form IDs the user registered for
 * @returns {Promise<Array>} Registered events data
 */
const fetchUserRegisteredEvents = async (eventIds) => {
    if (!eventIds || eventIds.length === 0) return [];

    try {
        const forms = await prisma.form.findMany({
            where: {
                id: { in: eventIds }
            }
        });

        const registeredEvents = forms.map(form => ({
            id: form.id,
            eventTitle: form.info?.eventTitle || 'Unknown Event',
            eventDate: form.info?.eventDate,
            isEventPast: form.info?.isEventPast || false
        }));

        console.log(`[Chatbot Controller] Fetched ${registeredEvents.length} registered events`);
        return registeredEvents;
    } catch (error) {
        console.error('[Chatbot Controller] Error fetching registered events:', error);
        return [];
    }
};

/**
 * Process chatbot message
 * @route POST /api/chatbot/message
 */
const processMessage = async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const user = req.user || null; // From auth middleware (optional)

        // Validate input
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a non-empty string'
            });
        }

        console.log(`[Chatbot] Processing: "${message.substring(0, 50)}..."`);
        console.log(`[Chatbot] User authenticated: ${user ? user.email : 'NO (not logged in)'}`);

        // Check if query requires authentication
        if (requiresAuth(message) && !user) {
            return res.status(200).json({
                success: false,
                requiresAuth: true,
                message: '🔐 Please sign in to access personalized information like your certificates or registered events.',
                authPrompt: true
            });
        }

        // Fetch context data in parallel (blogs included for all users)
        const [teamData, eventsData, blogsData] = await Promise.all([
            fetchTeamData(),
            fetchEventsData(),
            fetchBlogsData()
        ]);

        // Fetch user-specific data if authenticated
        let userData = null;
        if (user) {
            // Always fetch some user context when logged in
            const [certificates, registeredEvents] = await Promise.all([
                fetchUserCertificates(user.email),
                fetchUserRegisteredEvents(user.regForm || [])
            ]);

            userData = {
                name: user.name,
                email: user.email,
                access: user.access,
                certificates: certificates,
                registeredEvents: registeredEvents,
                registeredEventCount: registeredEvents.length,
                certificateCount: certificates.length
            };

            console.log(`[Chatbot] User context: ${userData.name}, ${userData.certificateCount} certs, ${userData.registeredEventCount} registrations`);
        }

        // Build prompts with all context
        const systemPrompt = buildPrompt(teamData, eventsData, blogsData, userData);
        const userMessage = buildMessageWithContext(message, teamData, eventsData, blogsData, userData);

        // Generate AI response
        const aiResponse = await generateResponse(systemPrompt, userMessage, conversationHistory);

        console.log(`[Chatbot] Response generated successfully`);

        return res.status(200).json({
            success: true,
            response: aiResponse,
            metadata: {
                teamMembersCount: teamData.length,
                ongoingEventsCount: eventsData.ongoingEvents.length,
                pastEventsCount: eventsData.pastEvents.length,
                blogsCount: blogsData.length,
                isAuthenticated: !!user,
                userName: user?.name || null
            }
        });

    } catch (error) {
        console.error('[Chatbot Controller] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'An error occurred while processing your message. Please try again.',
            details: process.env.DEBUG === 'true' ? error.message : undefined
        });
    }
};

/**
 * Health check endpoint
 * @route GET /api/chatbot/health
 */
const healthCheck = async (req, res) => {
    try {
        const geminiOk = await checkHealth();

        // Test database connection
        let dbOk = false;
        try {
            await prisma.$queryRaw`SELECT 1`;
            dbOk = true;
        } catch (e) {
            dbOk = false;
        }

        const isHealthy = geminiOk && dbOk;

        return res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            services: {
                gemini: geminiOk ? 'connected' : 'disconnected',
                database: dbOk ? 'connected' : 'disconnected'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
};

module.exports = {
    processMessage,
    healthCheck
};
