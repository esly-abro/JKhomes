/**
 * Attendance Controller
 * Handles attendance logs and auto-logout safety net.
 * 
 * PRESENCE is tracked via SSE connections (see sse.manager.js):
 *   SSE connect  → online + attendance check-in
 *   SSE disconnect (all tabs, after 30s grace) → offline + attendance check-out
 * 
 * This controller provides:
 *   - Manual check-in/out endpoints (fallback / explicit actions)
 *   - Status queries for owners to see agent presence
 *   - Attendance log queries
 *   - Auto-logout safety net (catches edge cases SSE disconnect handler misses)
 */

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const sseManager = require('../services/sse.manager');

// ─── Auto-logout timeout (minutes) ── safety net for crashed SSE connections ───
const AGENT_TIMEOUT_MINUTES = 15;

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
 * Returns online/offline status for all agents in the org (owner/admin only).
 * Cross-references SSE connection map for real-time accuracy.
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

        const result = agents.map(agent => {
            const id = agent._id.toString();
            // Cross-reference SSE connection for real-time accuracy
            const hasSSE = sseManager.isUserConnected(id);
            return {
                _id: agent._id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
                role: agent.role,
                isOnline: hasSSE || agent.isOnline || false,
                lastHeartbeat: agent.lastHeartbeat,
                lastLogin: agent.lastLogin,
                isActive: agent.isActive,
                todayAttendance: attendanceMap[id] || null
            };
        });

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
 * Auto-logout stale agents — SAFETY NET
 * Called periodically (every 2 minutes) from server.js.
 * 
 * Primary presence is handled by SSE disconnect → 30s grace → mark offline.
 * This cron catches edge cases:
 *   - Server crash/restart where SSE 'close' handlers didn't fire
 *   - Network partition where TCP connection hangs without FIN
 *   - Bug in SSE manager that fails to mark offline
 * 
 * Logic: If user.isOnline=true BUT has no SSE connection AND lastHeartbeat is stale,
 * then mark them offline. Owners/admins/managers are NEVER auto-logged out.
 */
async function autoLogoutStaleAgents() {
    try {
        const cutoff = new Date(Date.now() - AGENT_TIMEOUT_MINUTES * 60 * 1000);

        // Find agents who are marked online in DB
        const onlineAgents = await User.find({
            isOnline: true,
            role: { $in: ['agent', 'bpo'] }, // Only agents, NOT owners/admins/managers
        });

        if (onlineAgents.length === 0) return;

        let loggedOut = 0;
        for (const agent of onlineAgents) {
            const id = agent._id.toString();

            // If they have an active SSE connection, they're genuinely online — skip
            if (sseManager.isUserConnected(id)) continue;

            // No SSE connection + stale heartbeat → mark offline
            if (!agent.lastHeartbeat || agent.lastHeartbeat < cutoff) {
                agent.isOnline = false;
                agent.lastHeartbeat = null;
                await agent.save();

                await Attendance.checkOut(agent._id, 'auto-logout');
                loggedOut++;
                console.log(`⏰ Auto-logged out agent: ${agent.name} (${agent.email}) — no SSE + stale heartbeat`);
            }
        }

        if (loggedOut > 0) {
            console.log(`⏰ Auto-logout sweep: ${loggedOut} stale agent(s) cleaned up`);
        }
    } catch (error) {
        console.error('Auto-logout error:', error);
    }
}

module.exports = {
    checkIn,
    checkOut,
    getMyStatus,
    getAgentsStatus,
    getAttendanceLog,
    autoLogoutStaleAgents,
    AGENT_TIMEOUT_MINUTES
};
