/**
 * Invite Service
 * Team member invitation logic — send invite emails, accept/revoke invites.
 */

const Invite = require('../models/Invite');
const User = require('../models/User');
const { NotFoundError, ValidationError, ConflictError } = require('../errors/AppError');
const logger = require('../utils/logger');

class InviteService {
    /**
     * Send an invite to a new team member
     */
    async sendInvite({ email, role = 'agent' }, inviter) {
        if (!email) throw new ValidationError('Email is required');
        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists in this org
        const existingUser = await User.findOne({
            email: normalizedEmail,
            organizationId: inviter.organizationId
        });
        if (existingUser) {
            throw new ConflictError('A user with this email already exists in your organization');
        }

        // Check for duplicate pending invite
        const existingInvite = await Invite.hasPendingInvite(inviter.organizationId, normalizedEmail);
        if (existingInvite) {
            throw new ConflictError('A pending invite already exists for this email');
        }

        const invite = await Invite.create({
            organizationId: inviter.organizationId,
            invitedBy: inviter.id,
            email: normalizedEmail,
            role
        });

        // Send invite email (best-effort)
        try {
            const emailService = require('./email.service');
            if (emailService.sendInviteEmail) {
                await emailService.sendInviteEmail({
                    to: normalizedEmail,
                    inviterName: inviter.name || inviter.email,
                    role,
                    token: invite.token,
                    organizationName: inviter.organizationName || 'Your Organization'
                });
            }
        } catch (err) {
            logger.warn('Failed to send invite email', { error: err.message, email: normalizedEmail });
            // Don't fail — the invite is still created
        }

        return {
            _id: invite._id,
            email: invite.email,
            role: invite.role,
            status: invite.status,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt
        };
    }

    /**
     * List invites for an organization
     */
    async listInvites(organizationId, { status } = {}) {
        const filter = { organizationId };
        if (status) filter.status = status;

        return Invite.find(filter)
            .sort({ createdAt: -1 })
            .populate('invitedBy', 'name email')
            .lean();
    }

    /**
     * Revoke a pending invite
     */
    async revokeInvite(inviteId, organizationId) {
        const invite = await Invite.findOne({ _id: inviteId, organizationId, status: 'pending' });
        if (!invite) throw new NotFoundError('Invite not found or already processed');

        invite.status = 'revoked';
        await invite.save();
        return { revoked: true };
    }

    /**
     * Accept an invite (called during registration with invite token)
     */
    async acceptInvite(token, userId) {
        const invite = await Invite.findOne({ token, status: 'pending' });
        if (!invite) throw new NotFoundError('Invite not found or expired');

        if (invite.expiresAt < new Date()) {
            invite.status = 'expired';
            await invite.save();
            throw new ValidationError('This invite has expired');
        }

        invite.status = 'accepted';
        invite.acceptedAt = new Date();
        invite.acceptedUserId = userId;
        await invite.save();

        return {
            organizationId: invite.organizationId,
            role: invite.role
        };
    }
}

module.exports = new InviteService();
