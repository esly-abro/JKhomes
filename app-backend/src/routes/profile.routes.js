/**
 * Profile Routes
 * Fastify plugin for user profile management.
 * Prefix: /api/profile
 */

const profileController = require('../controllers/profile.controller');

async function profileRoutes(fastify, options) {
    // Get profile
    fastify.get('/', profileController.getProfile);

    // Update profile fields (name, phone, avatar, etc.)
    fastify.put('/', profileController.updateProfile);

    // Change password
    fastify.post('/change-password', profileController.changePassword);

    // Update notification preferences
    fastify.put('/notifications', profileController.updateNotifications);

    // Update email preferences
    fastify.put('/email-preferences', profileController.updateEmailPreferences);

    // Update general preferences (theme, language, timezone)
    fastify.put('/preferences', profileController.updatePreferences);
}

module.exports = profileRoutes;
