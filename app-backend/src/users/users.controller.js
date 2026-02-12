/**
 * Users Controller
 * Handles user management operations
 */

const User = require('../models/User');
const { notifyOwnerOfNewAgent, notifyAgentApproval, notifyAgentRejection } = require('../services/email.service');

/**
 * Get all users (with optional filtering)
 */
async function getAllUsers(req, reply) {
  try {
    const { status, role } = req.query;
    const filter = {};

    if (status) {
      filter.approvalStatus = status;
    }
    if (role) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return reply.send({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch users'
    });
  }
}

/**
 * Get pending users (awaiting approval)
 */
async function getPendingUsers(req, reply) {
  try {
    const pendingUsers = await User.find({ approvalStatus: 'pending' })
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    return reply.send({
      success: true,
      data: pendingUsers,
      count: pendingUsers.length
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch pending users'
    });
  }
}

/**
 * Approve user
 */
async function approveUser(req, reply) {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    const user = await User.findById(id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    if (user.approvalStatus === 'approved') {
      return reply.status(400).send({
        success: false,
        message: 'User is already approved'
      });
    }

    user.approvalStatus = 'approved';
    user.approvedBy = currentUser.id;
    user.approvedAt = new Date();
    user.isActive = true;
    await user.save();

    // Send approval email to agent
    try {
      await notifyAgentApproval(user.email, user.name);
    } catch (emailError) {
      console.error('Failed to send approval email:', emailError);
      // Don't fail the approval if email fails
    }

    return reply.send({
      success: true,
      message: 'User approved successfully',
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (error) {
    console.error('Approve user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to approve user'
    });
  }
}

/**
 * Reject user
 */
async function rejectUser(req, reply) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const currentUser = req.user;

    const user = await User.findById(id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    user.approvalStatus = 'rejected';
    user.approvedBy = currentUser.id;
    user.approvedAt = new Date();
    user.rejectionReason = reason || 'No reason provided';
    user.isActive = false;
    await user.save();

    // Send rejection email to agent
    try {
      await notifyAgentRejection(user.email, user.name, reason);
    } catch (emailError) {
      console.error('Failed to send rejection email:', emailError);
    }

    return reply.send({
      success: true,
      message: 'User rejected',
      data: {
        id: user._id,
        email: user.email,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (error) {
    console.error('Reject user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to reject user'
    });
  }
}

/**
 * Update user role
 */
async function updateUserRole(req, reply) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['owner', 'admin', 'manager', 'agent', 'bpo'].includes(role)) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid role'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent changing own role
    if (user._id.toString() === req.user.id) {
      return reply.status(403).send({
        success: false,
        message: 'Cannot change your own role'
      });
    }

    user.role = role;
    await user.save();

    return reply.send({
      success: true,
      message: 'User role updated',
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to update user role'
    });
  }
}

/**
 * Delete user
 */
async function deleteUser(req, reply) {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user.id) {
      return reply.status(403).send({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Prevent deleting owners (safety)
    if (user.role === 'owner') {
      return reply.status(403).send({
        success: false,
        message: 'Cannot delete owner accounts'
      });
    }

    await User.findByIdAndDelete(id);

    return reply.send({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to delete user'
    });
  }
}

/**
 * Get all agents (for property assignment)
 */
async function getAgents(req, reply) {
  try {
    const agents = await User.find({
      role: 'agent',
      approvalStatus: 'approved',
      isActive: true
    })
      .select('name email phone')
      .sort({ name: 1 });

    return reply.send({
      success: true,
      data: agents
    });
  } catch (error) {
    console.error('Get agents error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch agents'
    });
  }
}

/**
 * Get user by ID
 */
async function getUserById(req, reply) {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-passwordHash')
      .populate('approvedBy', 'name email');

    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    return reply.send({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch user'
    });
  }
}

/**
 * Get agent activity stats - comprehensive activity data
 */
async function getAgentActivity(req, reply) {
  try {
    const { id } = req.params;
    const Activity = require('../models/Activity');
    const CallLog = require('../models/CallLog');
    const SiteVisit = require('../models/SiteVisit');
    const Lead = require('../models/Lead');
    const LoginHistory = require('../models/LoginHistory');

    // Get agent details
    const agent = await User.findById(id).select('-passwordHash');
    if (!agent) {
      return reply.status(404).send({
        success: false,
        message: 'Agent not found'
      });
    }

    // Get date ranges
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Fetch all leads assigned to this agent
    const leads = await Lead.find({ assignedTo: id });
    const leadIds = leads.map(l => l.zohoId || l._id.toString());

    // Lead statistics
    const leadStats = {
      total: leads.length,
      byStatus: {}
    };
    leads.forEach(lead => {
      const status = lead.status || 'unknown';
      leadStats.byStatus[status] = (leadStats.byStatus[status] || 0) + 1;
    });

    // Fetch activities by this agent
    const activities = await Activity.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(100);

    // Activity breakdown
    const activityStats = {
      total: activities.length,
      today: activities.filter(a => new Date(a.createdAt) >= today).length,
      thisWeek: activities.filter(a => new Date(a.createdAt) >= thisWeekStart).length,
      thisMonth: activities.filter(a => new Date(a.createdAt) >= thisMonthStart).length,
      byType: {}
    };
    activities.forEach(activity => {
      const type = activity.type || 'other';
      activityStats.byType[type] = (activityStats.byType[type] || 0) + 1;
    });

    // Fetch call logs by this agent
    const callLogs = await CallLog.find({ agentId: id })
      .sort({ createdAt: -1 })
      .limit(100);

    const callStats = {
      total: callLogs.length,
      today: callLogs.filter(c => new Date(c.createdAt) >= today).length,
      thisWeek: callLogs.filter(c => new Date(c.createdAt) >= thisWeekStart).length,
      thisMonth: callLogs.filter(c => new Date(c.createdAt) >= thisMonthStart).length,
      totalDuration: callLogs.reduce((sum, c) => sum + (c.duration || 0), 0),
      completed: callLogs.filter(c => c.status === 'completed').length,
      byStatus: {}
    };
    callLogs.forEach(call => {
      const status = call.status || 'unknown';
      callStats.byStatus[status] = (callStats.byStatus[status] || 0) + 1;
    });

    // Fetch appointments by this agent
    const siteVisits = await SiteVisit.find({ agentId: id })
      .sort({ scheduledAt: -1 })
      .limit(100);

    const siteVisitStats = {
      total: siteVisits.length,
      scheduled: siteVisits.filter(v => v.status === 'scheduled').length,
      completed: siteVisits.filter(v => v.status === 'completed').length,
      cancelled: siteVisits.filter(v => v.status === 'cancelled').length,
      noShow: siteVisits.filter(v => v.status === 'no_show').length,
      upcoming: siteVisits.filter(v => v.status === 'scheduled' && new Date(v.scheduledAt) >= today).length,
      today: siteVisits.filter(v => {
        const visitDate = new Date(v.scheduledAt);
        visitDate.setHours(0, 0, 0, 0);
        return visitDate.getTime() === today.getTime();
      }).length
    };
    // Generic alias
    const appointmentStats = siteVisitStats;

    // Fetch login history if available
    let loginHistory = [];
    try {
      loginHistory = await LoginHistory.find({ userId: id })
        .sort({ loginAt: -1 })
        .limit(30);
    } catch (err) {
      // LoginHistory model may not exist, that's ok
      console.log('LoginHistory not available');
    }

    // Calculate performance metrics
    const conversionRate = leadStats.total > 0 
      ? ((leadStats.byStatus['Interested'] || 0) / leadStats.total * 100).toFixed(1)
      : 0;

    // Recent activities (last 10)
    const recentActivities = activities.slice(0, 10).map(a => ({
      _id: a._id,
      type: a.type,
      title: a.title,
      description: a.description,
      outcome: a.outcome,
      createdAt: a.createdAt,
      leadId: a.leadId
    }));

    // Recent calls (last 10)
    const recentCalls = callLogs.slice(0, 10).map(c => ({
      _id: c._id,
      leadName: c.leadName,
      to: c.to,
      status: c.status,
      duration: c.duration,
      createdAt: c.createdAt
    }));

    // Upcoming appointments
    const upcomingSiteVisits = siteVisits
      .filter(v => v.status === 'scheduled' && new Date(v.scheduledAt) >= today)
      .slice(0, 5)
      .map(v => ({
        _id: v._id,
        leadName: v.leadName,
        scheduledAt: v.scheduledAt,
        propertyId: v.propertyId
      }));

    return reply.send({
      success: true,
      data: {
        agent: {
          _id: agent._id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          role: agent.role,
          isActive: agent.isActive,
          approvalStatus: agent.approvalStatus,
          lastLogin: agent.lastLogin,
          createdAt: agent.createdAt
        },
        leadStats,
        activityStats,
        callStats,
        siteVisitStats,
        appointmentStats,
        performance: {
          conversionRate: parseFloat(conversionRate),
          avgCallDuration: callStats.total > 0 
            ? Math.round(callStats.totalDuration / callStats.total) 
            : 0,
          callCompletionRate: callStats.total > 0 
            ? parseFloat((callStats.completed / callStats.total * 100).toFixed(1))
            : 0
        },
        loginHistory: loginHistory.map(l => ({
          loginAt: l.loginAt,
          logoutAt: l.logoutAt,
          duration: l.duration,
          ipAddress: l.ipAddress
        })),
        recentActivities,
        recentCalls,
        upcomingSiteVisits,
        upcomingAppointments: upcomingSiteVisits
      }
    });
  } catch (error) {
    console.error('Get agent activity error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch agent activity'
    });
  }
}

module.exports = {
  getAllUsers,
  getPendingUsers,
  approveUser,
  rejectUser,
  updateUserRole,
  deleteUser,
  getUserById,
  getAgents,
  getAgentActivity
};
