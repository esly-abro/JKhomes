const assignmentService = require('./assignment.service');
const emailService = require('../services/email.service');
const Lead = require('../models/Lead');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Group successful assignments by agent and send one email per agent
 */
async function _sendAssignmentEmails(results, assigner, organizationId) {
  const successByAgent = {};
  for (const r of results) {
    if (r.success && r.assignedTo) {
      const key = r.assignedTo.toString();
      if (!successByAgent[key]) successByAgent[key] = { agentName: r.agentName, leadIds: [] };
      successByAgent[key].leadIds.push(r.leadId);
    }
  }

  for (const [agentIdStr, data] of Object.entries(successByAgent)) {
    try {
      const agent = await User.findById(agentIdStr).select('name email');
      if (!agent?.email) continue;

      // Fetch lead details
      const leads = await Promise.all(data.leadIds.map(async (lid) => {
        const query = { $or: [{ zohoId: lid }, { zohoLeadId: lid }] };
        if (mongoose.Types.ObjectId.isValid(lid)) query.$or.push({ _id: lid });
        const lead = await Lead.findOne(query).select('name phone status source').lean();
        return lead || { name: lid, phone: 'N/A', status: 'New', source: 'N/A' };
      }));

      const assignerName = assigner?.name || assigner?.email || 'Your manager';
      await emailService.sendLeadAssignmentEmail(
        agent.email, agent.name || agent.email, leads, assignerName, organizationId
      );
    } catch (err) {
      console.error(`Failed to send assignment email to agent ${agentIdStr}:`, err.message);
    }
  }
}

async function assignLeads(req, reply) {
  try {
    const { leadIds, agentId, autoAssign } = req.body;
    const assignedBy = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return reply.code(400).send({ error: 'leadIds array is required' });
    }

    if (!autoAssign && !agentId) {
      return reply.code(400).send({ error: 'agentId is required when autoAssign is false' });
    }

    const results = await assignmentService.assignLeads(
      leadIds,
      agentId,
      assignedBy,
      autoAssign
    );

    // Send email notification to agents (non-blocking)
    _sendAssignmentEmails(results, req.user, organizationId).catch(err => {
      console.error('Failed to send assignment emails:', err.message);
    });

    return reply.code(200).send({
      message: 'Lead assignment completed',
      results
    });
  } catch (error) {
    console.error('Assign leads controller error:', error);
    return reply.code(500).send({ error: 'Failed to assign leads' });
  }
}

async function getAgentWorkload(req, reply) {
  try {
    const workload = await assignmentService.getAgentWorkload();
    return reply.code(200).send(workload);
  } catch (error) {
    console.error('Get agent workload controller error:', error);
    return reply.code(500).send({ error: 'Failed to fetch agent workload' });
  }
}

async function reassignLeads(req, reply) {
  try {
    const { fromAgentId, toAgentId, leadIds } = req.body;
    const organizationId = req.user?.organizationId;

    if (!fromAgentId || !toAgentId) {
      return reply.code(400).send({ error: 'fromAgentId and toAgentId are required' });
    }

    const result = await assignmentService.reassignLeads(fromAgentId, toAgentId, leadIds);

    // Send email to the new agent (non-blocking)
    _sendAssignmentEmails(result.results, req.user, organizationId).catch(err => {
      console.error('Failed to send reassignment emails:', err.message);
    });

    return reply.code(200).send({
      message: 'Lead reassignment completed',
      ...result
    });
  } catch (error) {
    console.error('Reassign leads controller error:', error);
    return reply.code(500).send({ error: 'Failed to reassign leads' });
  }
}

module.exports = { assignLeads, reassignLeads, getAgentWorkload };
