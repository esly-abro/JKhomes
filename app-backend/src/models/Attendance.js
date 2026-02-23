/**
 * Attendance Model
 * Tracks agent daily check-in/check-out for attendance management
 */

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    date: {
        type: String, // YYYY-MM-DD format for easy querying
        required: true
    },
    checkIn: {
        type: Date,
        required: true
    },
    checkOut: {
        type: Date,
        default: null
    },
    totalMinutes: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['checked-in', 'checked-out', 'auto-logout'],
        default: 'checked-in'
    },
    // Track multiple sessions per day
    sessions: [{
        start: { type: Date, required: true },
        end: { type: Date, default: null },
        duration: { type: Number, default: 0 }, // minutes
        endReason: { type: String, enum: ['manual', 'auto-logout', 'session-active'], default: 'session-active' }
    }]
}, {
    timestamps: true
});

// Compound index: one attendance record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organizationId: 1, date: 1 });
attendanceSchema.index({ date: -1 });

/**
 * Check in — creates or resumes attendance for today
 */
attendanceSchema.statics.checkIn = async function(userId, organizationId) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    let record = await this.findOne({ userId, date: today });

    if (record) {
        // Already have a record today — start a new session
        const lastSession = record.sessions[record.sessions.length - 1];
        if (lastSession && !lastSession.end) {
            // Session still open, just return
            return record;
        }
        record.sessions.push({ start: now });
        record.status = 'checked-in';
        await record.save();
        return record;
    }

    // First check-in today
    record = await this.create({
        userId,
        organizationId,
        date: today,
        checkIn: now,
        status: 'checked-in',
        sessions: [{ start: now }]
    });

    return record;
};

/**
 * Check out — closes the current session
 */
attendanceSchema.statics.checkOut = async function(userId, reason = 'manual') {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const record = await this.findOne({ userId, date: today });
    if (!record) return null;

    // Close the last open session
    const lastSession = record.sessions[record.sessions.length - 1];
    if (lastSession && !lastSession.end) {
        lastSession.end = now;
        lastSession.duration = Math.round((now - lastSession.start) / 60000);
        lastSession.endReason = reason;
    }

    // Recalculate total minutes
    record.totalMinutes = record.sessions.reduce((total, s) => total + (s.duration || 0), 0);
    record.checkOut = now;
    record.status = reason === 'auto-logout' ? 'auto-logout' : 'checked-out';
    await record.save();

    return record;
};

/**
 * Get attendance for a date range
 */
attendanceSchema.statics.getAttendance = async function(organizationId, startDate, endDate, userId = null) {
    const filter = {
        organizationId,
        date: { $gte: startDate, $lte: endDate }
    };
    if (userId) filter.userId = userId;

    return this.find(filter)
        .populate('userId', 'name email role phone')
        .sort({ date: -1, checkIn: -1 });
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
