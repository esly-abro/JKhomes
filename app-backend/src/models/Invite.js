/**
 * Invite Model
 * Tracks team member invitations within an organization.
 * Multi-tenant: scoped to organizationId.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const inviteSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    /** User who sent the invite */
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'agent', 'bpo'],
        default: 'agent'
    },
    /** Unique invite token for email link */
    token: {
        type: String,
        unique: true,
        default: () => crypto.randomBytes(32).toString('hex')
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'expired', 'revoked'],
        default: 'pending'
    },
    /** Invite expires after 7 days by default */
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        index: true
    },
    acceptedAt: {
        type: Date
    },
    /** The user that was created when the invite was accepted */
    acceptedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Prevent duplicate pending invites to the same email in the same org
inviteSchema.index({ organizationId: 1, email: 1, status: 1 });

/**
 * Check if a pending invite already exists for this email in this org
 */
inviteSchema.statics.hasPendingInvite = async function (organizationId, email) {
    return this.findOne({
        organizationId,
        email: email.toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: new Date() }
    });
};

/**
 * Mark expired invites
 */
inviteSchema.statics.expireOldInvites = async function () {
    return this.updateMany(
        { status: 'pending', expiresAt: { $lt: new Date() } },
        { $set: { status: 'expired' } }
    );
};

module.exports = mongoose.model('Invite', inviteSchema);
