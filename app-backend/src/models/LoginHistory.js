/**
 * Login History Schema
 * Tracks user login and logout sessions
 */

const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    loginAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    logoutAt: {
        type: Date
    },
    duration: {
        type: Number, // Duration in minutes
        default: 0
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    sessionId: {
        type: String,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for faster queries
loginHistorySchema.index({ userId: 1, loginAt: -1 });
loginHistorySchema.index({ isActive: 1 });

/**
 * Record a new login
 */
loginHistorySchema.statics.recordLogin = async function(userId, ipAddress, userAgent, sessionId) {
    return this.create({
        userId,
        loginAt: new Date(),
        ipAddress,
        userAgent,
        sessionId,
        isActive: true
    });
};

/**
 * Record logout
 */
loginHistorySchema.statics.recordLogout = async function(userId, sessionId) {
    const session = await this.findOne({ 
        userId, 
        sessionId,
        isActive: true 
    });
    
    if (session) {
        session.logoutAt = new Date();
        session.isActive = false;
        session.duration = Math.round((session.logoutAt - session.loginAt) / 60000); // minutes
        await session.save();
        return session;
    }
    return null;
};

/**
 * Get user's login history
 */
loginHistorySchema.statics.getUserHistory = async function(userId, limit = 30) {
    return this.find({ userId })
        .sort({ loginAt: -1 })
        .limit(limit);
};

/**
 * End all active sessions for a user
 */
loginHistorySchema.statics.endAllSessions = async function(userId) {
    const now = new Date();
    return this.updateMany(
        { userId, isActive: true },
        { 
            $set: { 
                logoutAt: now, 
                isActive: false 
            }
        }
    );
};

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);

module.exports = LoginHistory;
