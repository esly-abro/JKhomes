/**
 * Attendance Controller
 * Handles agent presence tracking, heartbeat, attendance logs, and auto-logout
 */

const User = require('../models/User');
const Attendance = require('../models/Attendance');

// ─── Auto-logout timeout (minutes) ───
const AGENT_TIMEOUT_MINUTES = 15;

/**
 * POST /api/attendance/heartbeat
 * Called every 2 minutes by agent's browser to keep them "online".
 * Also keeps their attendance session alive.
 */
async function heartbeat(req, reply) {
    try {
        const userId = req.user.id;
        const now = new Date();

        await User.findByIdAndUpdate(userId, {
            isOnline: true,
            lastHeartbeat: now
        });

        return reply.send({ success: true, timestamp: now });
    } catch (error) {
        console.error('Heartbeat error:', error);
        return reply.status(500).send({ success: false, message: 'Heartbeat failed' });
    }
}

/**
 * POST /api/attendance/check-in
 * Called on login — marks user online and creates attendance record
 */
async function checkIn(req, reply) {
    try {
        const userId = req.user.id;
        const organizationId = req.user.organizationId;
        const now = new Date();

        // Mark user online
        await User.findByIdAndUpdate(userId, {
            isOnline: true,
            lastHeartbeat: now
        });

        // Create/resume attendance record
        const attendance = await Attendance.checkIn(userId, organizationId);

        return reply.send({
            success: true,
            message: 'Checked in',
            data: {
                date: attendance.date,
                checkIn: attendance.checkIn,
                sessions: attendance.sessions.length
            }
        });
    } catch (error) {
        console.error('Check-in error:', error);
        return reply.status(500).send({ success: false, message: 'Check-in failed' });
    }
}

/**
 * POST /api/attendance/check-out
 * Called on manual logout — marks user offline and closes attendance session
 */
async function checkOut(req, reply) {
    try {
        const userId = req.user.id;

        // Mark user offline
        await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastHeartbeat: null
        });

        // Close attendance session
        const attendance = await Attendance.checkOut(userId, 'manual');

        return reply.send({
            success: true,
            message: 'Checked out',
            data: attendance ? {
                date: attendance.date,
                totalMinutes: attendance.totalMinutes,
                sessions: attendance.sessions.length
            } : null
        });
    } catch (error) {
        console.error('Check-out error:', error);
        return reply.status(500).send({ success: false, message: 'Check-out failed' });
    }
}

/**
 * GET /api/attendance/status
 * Returns the caller's current online status and today's attendance
 */
async function getMyStatus(req, reply) {
    try {
        const userId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        const [user, attendance] = await Promise.all([
            User.findById(userId).select('isOnline lastHeartbeat role'),
            Attendance.findOne({ userId, date: today })
        ]);

        return reply.send({
            success: true,
            data: {
                isOnline: user?.isOnline || false,
                lastHeartbeat: user?.lastHeartbeat,
                role: user?.role,
                today: attendance ? {
                    date: attendance.date,
                    checkIn: attendance.checkIn,
                    checkOut: attendance.checkOut,
                    totalMinutes: attendance.totalMinutes,
                    sessions: attendance.sessions.length,
                    status: attendance.status
                } : null
            }
        });
    } catch (error) {
        console.error('Get status error:', error);
        return reply.status(500).send({ success: false, message: 'Failed to get status' });
    }
}

/**
 * GET /api/attendance/agents-status
 * Returns online/offline status for all agents in the org (owner/admin only)
 */
async function getAgentsStatus(req, reply) {
    try {
        const filter = {
            role: { $in: ['agent', 'bpo'] },
            approvalStatus: 'approved'
        };
        if (req.user.organizationId) {
            filter.organizationId = req.user.organizationId;
        }

        const agents = await User.find(filter)
            .select('name email phone role isOnline lastHeartbeat lastLogin isActive')
            .sort({ isOnline: -1, name: 1 });

        // Also get today's attendance for all agents
        const today = new Date().toISOString().split('T')[0];
        const agentIds = agents.map(a => a._id);
        const todayAttendance = await Attendance.find({
            userId: { $in: agentIds },
            date: today
        });
        const attendanceMap = {};
        todayAttendance.forEach(a => {
            attendanceMap[a.userId.toString()] = {
                checkIn: a.checkIn,
                checkOut: a.checkOut,
                totalMinutes: a.totalMinutes,
                sessions: a.sessions.length,
                status: a.status
            };
        });

        const result = agents.map(agent => ({
            _id: agent._id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            role: agent.role,
            isOnline: agent.isOnline || false,
            lastHeartbeat: agent.lastHeartbeat,
            lastLogin: agent.lastLogin,
            isActive: agent.isActive,
            todayAttendance: attendanceMap[agent._id.toString()] || null
        }));

        return reply.send({
            success: true,
            data: result,
            summary: {
                total: result.length,
                online: result.filter(a => a.isOnline).length,
                offline: result.filter(a => !a.isOnline).length,
                checkedInToday: todayAttendance.length
            }
        });
    } catch (error) {
        console.error('Get agents status error:', error);
        return reply.status(500).send({ success: false, message: 'Failed to fetch agent statuses' });
    }
}

/**
 * GET /api/attendance/log
 * Returns attendance log for date range (owner/admin only)
 * Query params: startDate, endDate, userId (optional)
 */
async function getAttendanceLog(req, reply) {
    try {
        const { startDate, endDate, userId } = req.query;
        const organizationId = req.user.organizationId;

        // Default to last 7 days
        const end = endDate || new Date().toISOString().split('T')[0];
        const start = startDate || (() => {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            return d.toISOString().split('T')[0];
        })();

        const records = await Attendance.getAttendance(organizationId, start, end, userId || null);

        return reply.send({
            success: true,
            data: records,
            meta: {
                startDate: start,
                endDate: end,
                totalRecords: records.length
            }
        });
    } catch (error) {
        console.error('Get attendance log error:', error);
        return reply.status(500).send({ success: false, message: 'Failed to fetch attendance log' });
    }
}

/**
 * Auto-logout stale agents
 * Called periodically (every 1 minute) from server.js
 * Agents who haven't sent a heartbeat in AGENT_TIMEOUT_MINUTES are marked offline
 * Owners/admins/managers are NEVER auto-logged out
 */
async function autoLogoutStaleAgents() {
    try {
        const cutoff = new Date(Date.now() - AGENT_TIMEOUT_MINUTES * 60 * 1000);

        // Find agents who are online but last heartbeat is stale
        const staleAgents = await User.find({
            isOnline: true,
            role: { $in: ['agent', 'bpo'] }, // Only auto-logout agents, NOT owners/admins/managers
            lastHeartbeat: { $lt: cutoff }
        });

        if (staleAgents.length === 0) return;

        for (const agent of staleAgents) {
            // Mark offline
            agent.isOnline = false;
            agent.lastHeartbeat = null;
            await agent.save();

            // Close their attendance session
            await Attendance.checkOut(agent._id, 'auto-logout');

            console.log(`⏰ Auto-logged out agent: ${agent.name} (${agent.email}) — inactive for ${AGENT_TIMEOUT_MINUTES}+ min`);
        }
    } catch (error) {
        console.error('Auto-logout error:', error);
    }
}

module.exports = {
    heartbeat,
    checkIn,
    checkOut,
    getMyStatus,
    getAgentsStatus,
    getAttendanceLog,
    autoLogoutStaleAgents,
    AGENT_TIMEOUT_MINUTES
};
