const assignmentService = require('./assignment.service');

class AssignmentController {
  async assignLeads(req, reply) {
    try {
      const { leadIds, agentId, autoAssign } = req.body;
      const assignedBy = req.user?.id;

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

      return reply.code(200).send({
        message: 'Lead assignment completed',
        results
      });
    } catch (error) {
      console.error('Assign leads controller error:', error);
      return reply.code(500).send({ error: 'Failed to assign leads' });
    }
  }

  async getAgentWorkload(req, reply) {
    try {
      const workload = await assignmentService.getAgentWorkload();
      return reply.code(200).send(workload);
    } catch (error) {
      console.error('Get agent workload controller error:', error);
      return reply.code(500).send({ error: 'Failed to fetch agent workload' });
    }
  }

  async reassignLeads(req, reply) {
    try {
      const { fromAgentId, toAgentId, leadIds } = req.body;

      if (!fromAgentId || !toAgentId) {
        return reply.code(400).send({ error: 'fromAgentId and toAgentId are required' });
      }

      const result = await assignmentService.reassignLeads(fromAgentId, toAgentId, leadIds);
      
      return reply.code(200).send({
        message: 'Lead reassignment completed',
        ...result
      });
    } catch (error) {
      console.error('Reassign leads controller error:', error);
      return reply.code(500).send({ error: 'Failed to reassign leads' });
    }
  }
}

module.exports = new AssignmentController();
