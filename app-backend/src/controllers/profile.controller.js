/**
 * Profile Controller
 * HTTP handlers for user profile management, password change, preferences.
 */

const profileService = require('../services/profile.service');

/**
 * GET /api/profile
 */
async function getProfile(request, reply) {
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;

    const profile = await profileService.getProfile(userId, organizationId);
    return reply.code(200).send({ success: true, data: profile });
}

/**
 * PUT /api/profile
 * Body: { name, phone, avatar, timezone, language }
 */
async function updateProfile(request, reply) {
    const userId = request.user.id || request.user._id;
    const profile = await profileService.updateProfile(userId, request.body);
    return reply.code(200).send({ success: true, data: profile });
}

/**
 * POST /api/profile/change-password
 * Body: { currentPassword, newPassword }
 */
async function changePassword(request, reply) {
    const userId = request.user.id || request.user._id;
    const result = await profileService.changePassword(userId, request.body);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * PUT /api/profile/notifications
 * Body: { email: bool, sms: bool, push: bool }
 */
async function updateNotifications(request, reply) {
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;

    const result = await profileService.updateNotificationPreferences(userId, organizationId, request.body);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * PUT /api/profile/email-preferences
 * Body: { digest, marketing, leadAlerts, taskReminders }
 */
async function updateEmailPreferences(request, reply) {
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;

    const result = await profileService.updateEmailPreferences(userId, organizationId, request.body);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * PUT /api/profile/preferences
 * Body: { theme, language, timezone }
 */
async function updatePreferences(request, reply) {
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;

    const result = await profileService.updatePreferences(userId, organizationId, request.body);
    return reply.code(200).send({ success: true, data: result });
}

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    updateNotifications,
    updateEmailPreferences,
    updatePreferences
};
