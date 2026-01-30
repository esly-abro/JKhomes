/**
 * Refresh Token Schema
 * MongoDB model for JWT refresh token storage
 */

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isRevoked: {
        type: Boolean,
        default: false
    },
    // Track device/client info
    userAgent: {
        type: String
    },
    ipAddress: {
        type: String
    }
}, {
    timestamps: true
});

// Index for faster lookups and cleanup (token index is auto-created by unique: true)
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index - auto-delete expired tokens

/**
 * Check if token is valid (not expired and not revoked)
 */
refreshTokenSchema.methods.isValid = function() {
    return !this.isRevoked && this.expiresAt > new Date();
};

/**
 * Revoke this token
 */
refreshTokenSchema.methods.revoke = async function() {
    this.isRevoked = true;
    await this.save();
};

/**
 * Static: Revoke all tokens for a user (logout from all devices)
 */
refreshTokenSchema.statics.revokeAllForUser = async function(userId) {
    await this.updateMany(
        { userId, isRevoked: false },
        { isRevoked: true }
    );
};

/**
 * Static: Clean up expired tokens
 */
refreshTokenSchema.statics.cleanupExpired = async function() {
    const result = await this.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },
            { isRevoked: true }
        ]
    });
    return result.deletedCount;
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
