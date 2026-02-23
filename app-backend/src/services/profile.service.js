/**
 * Profile Service
 * User profile update, password change, notification/email preferences.
 */

const User = require('../models/User');
const Settings = require('../models/settings.model');
const bcrypt = require('bcrypt');
const { NotFoundError, ValidationError, UnauthorizedError } = require('../errors/AppError');
const logger = require('../utils/logger');

/**
 * Get full profile (user + settings merged)
 */
async function getProfile(userId, organizationId) {
    const [user, settings] = await Promise.all([
        User.findById(userId).select('-password -__v').lean(),
        Settings.findOne({ userId, organizationId }).lean()
    ]);

    if (!user) throw new NotFoundError('User');

    return {
        ...user,
        settings: settings ? {
            notifications: settings.notifications || {},
            preferences: settings.preferences || {}
        } : { notifications: {}, preferences: {} }
    };
}

/**
 * Update profile fields (name, phone, avatar, etc.)
 */
async function updateProfile(userId, updates) {
    const allowedFields = ['name', 'phone', 'avatar', 'timezone', 'language'];
    const sanitized = {};

    for (const key of allowedFields) {
        if (updates[key] !== undefined) {
            sanitized[key] = updates[key];
        }
    }

    if (Object.keys(sanitized).length === 0) {
        throw new ValidationError('No valid fields to update');
    }

    const user = await User.findByIdAndUpdate(userId, { $set: sanitized }, { new: true, runValidators: true })
        .select('-password -__v');

    if (!user) throw new NotFoundError('User');

    logger.info(`Profile updated for user ${userId}: ${Object.keys(sanitized).join(', ')}`);
    return user.toObject();
}

/**
 * Change password
 */
async function changePassword(userId, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
        throw new ValidationError('Current password and new password are required');
    }
    if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
        throw new UnauthorizedError('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    logger.info(`Password changed for user ${userId}`);
    return { success: true };
}

/**
 * Update notification preferences
 */
async function updateNotificationPreferences(userId, organizationId, preferences) {
    const settings = await Settings.findOneAndUpdate(
        { userId, organizationId },
        {
            $set: {
                'notifications.email': preferences.email ?? true,
                'notifications.sms': preferences.sms ?? false,
                'notifications.push': preferences.push ?? true
            }
        },
        { new: true, upsert: true }
    ).lean();

    logger.info(`Notification preferences updated for user ${userId}`);
    return settings.notifications;
}

/**
 * Update email preferences (digest frequency, marketing opt-in, etc.)
 */
async function updateEmailPreferences(userId, organizationId, emailPrefs) {
    const settings = await Settings.findOneAndUpdate(
        { userId, organizationId },
        {
            $set: {
                'preferences.emailDigest': emailPrefs.digest || 'daily',
                'preferences.marketingEmails': emailPrefs.marketing !== false,
                'preferences.leadAlerts': emailPrefs.leadAlerts !== false,
                'preferences.taskReminders': emailPrefs.taskReminders !== false
            }
        },
        { new: true, upsert: true }
    ).lean();

    logger.info(`Email preferences updated for user ${userId}`);
    return settings.preferences;
}

/**
 * Update general preferences (theme, language, timezone)
 */
async function updatePreferences(userId, organizationId, prefs) {
    const updateFields = {};
    if (prefs.theme) updateFields['preferences.theme'] = prefs.theme;
    if (prefs.language) updateFields['preferences.language'] = prefs.language;
    if (prefs.timezone) updateFields['preferences.timezone'] = prefs.timezone;

    if (Object.keys(updateFields).length === 0) {
        throw new ValidationError('No valid preferences to update');
    }

    const settings = await Settings.findOneAndUpdate(
        { userId, organizationId },
        { $set: updateFields },
        { new: true, upsert: true }
    ).lean();

    logger.info(`Preferences updated for user ${userId}`);
    return settings.preferences;
}

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    updateNotificationPreferences,
    updateEmailPreferences,
    updatePreferences
};
