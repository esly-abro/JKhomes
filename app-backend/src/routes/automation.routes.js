/**
 * Automation Routes for Fastify
 */

const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const workflowEngine = require('../services/workflow.engine');

async function automationRoutes(fastify, options) {
  const { requireRole } = require('../middleware/roles');

  /**
   * GET /api/automations
   * Get all automations for the current user/company
   */
  fastify.get('/', async (request, reply) => {
    try {
      // Handle case where user might not be set (for development)
      const userId = request.user?._id;
      const userRole = request.user?.role;
      
      const query = !userId || userRole === 'admin' || userRole === 'owner'
        ? {} // No user or Admins/owners can see all
        : { owner: userId };

      const automations = await Automation.find(query)
        .sort({ updatedAt: -1 })
        .populate('owner', 'name email');

      return {
        success: true,
        data: automations
      };
    } catch (error) {
      console.error('Error fetching automations:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch automations'
      });
    }
  });

  /**
   * GET /api/automations/:id
   * Get a single automation by ID
   */
  fastify.get('/:id', async (request, reply) => {
    try {
      const automation = await Automation.findById(request.params.id)
        .populate('owner', 'name email');

      if (!automation) {
        return reply.code(404).send({
          success: false,
          error: 'Automation not found'
        });
      }

      // Check access (skip if no user - development mode)
      if (request.user) {
        const isAdmin = request.user.role === 'admin' || request.user.role === 'owner';
        if (!isAdmin && automation.owner._id.toString() !== request.user._id.toString()) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }
      }

      return {
        success: true,
        data: automation
      };
    } catch (error) {
      console.error('Error fetching automation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch automation'
      });
    }
  });

  /**
   * POST /api/automations
   * Create a new automation
   */
  fastify.post('/', async (request, reply) => {
    try {
      const { name, description, nodes, edges, isActive, triggerConditions } = request.body;

      // Find trigger node to determine trigger type
      const triggerNode = nodes?.find(n => n.type === 'trigger');
      const triggerType = triggerNode?.data?.type || 'newLead';

      // Get user ID if available (null is acceptable for dev mode)
      const ownerId = request.user?._id || null;

      const automation = new Automation({
        name: name || 'Untitled Automation',
        description,
        owner: ownerId,
        nodes: nodes || [],
        edges: edges || [],
        isActive: isActive !== undefined ? isActive : true, // Default to active
        triggerType,
        triggerConditions
      });

      await automation.save();

      console.log(`✅ Automation saved: ${automation.name} (triggerType: ${triggerType}, isActive: ${automation.isActive})`);

      return reply.code(201).send({
        success: true,
        data: automation,
        message: 'Automation created successfully'
      });
    } catch (error) {
      console.error('Error creating automation:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to create automation'
      });
    }
  });

  /**
   * PUT /api/automations/:id
   * Update an automation
   */
  fastify.put('/:id', async (request, reply) => {
    try {
      const automation = await Automation.findById(request.params.id);

      if (!automation) {
        return reply.code(404).send({
          success: false,
          error: 'Automation not found'
        });
      }

      // Check access (skip if no user - development mode)
      if (request.user) {
        const isAdmin = request.user.role === 'admin' || request.user.role === 'owner';
        if (!isAdmin && automation.owner.toString() !== request.user._id.toString()) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }
      }

      const { name, description, nodes, edges, isActive, triggerConditions } = request.body;

      // Find trigger node to determine trigger type
      const triggerNode = nodes?.find(n => n.type === 'trigger');
      if (triggerNode) {
        automation.triggerType = triggerNode.data?.type || 'newLead';
      }

      if (name !== undefined) automation.name = name;
      if (description !== undefined) automation.description = description;
      if (nodes !== undefined) automation.nodes = nodes;
      if (edges !== undefined) automation.edges = edges;
      if (isActive !== undefined) automation.isActive = isActive;
      if (triggerConditions !== undefined) automation.triggerConditions = triggerConditions;

      await automation.save();

      return {
        success: true,
        data: automation,
        message: 'Automation updated successfully'
      };
    } catch (error) {
      console.error('Error updating automation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update automation'
      });
    }
  });

  /**
   * DELETE /api/automations/:id
   * Delete an automation
   */
  fastify.delete('/:id', async (request, reply) => {
    try {
      const automation = await Automation.findById(request.params.id);

      if (!automation) {
        return reply.code(404).send({
          success: false,
          error: 'Automation not found'
        });
      }

      // Check access (skip if no user - development mode)
      if (request.user) {
        const isAdmin = request.user.role === 'admin' || request.user.role === 'owner';
        if (!isAdmin && automation.owner.toString() !== request.user._id.toString()) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }
      }

      await Automation.findByIdAndDelete(request.params.id);

      // Also delete related runs and jobs
      await AutomationRun.deleteMany({ automation: request.params.id });
      await AutomationJob.deleteMany({ automation: request.params.id });

      return {
        success: true,
        message: 'Automation deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting automation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete automation'
      });
    }
  });

  /**
   * POST /api/automations/:id/toggle
   * Toggle automation active state
   */
  fastify.post('/:id/toggle', async (request, reply) => {
    try {
      const automation = await Automation.findById(request.params.id);

      if (!automation) {
        return reply.code(404).send({
          success: false,
          error: 'Automation not found'
        });
      }

      // Check access
      const isAdmin = request.user.role === 'admin' || request.user.role === 'owner';
      if (!isAdmin && automation.owner.toString() !== request.user._id.toString()) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied'
        });
      }

      automation.isActive = !automation.isActive;
      await automation.save();

      return {
        success: true,
        data: automation,
        message: `Automation ${automation.isActive ? 'activated' : 'paused'}`
      };
    } catch (error) {
      console.error('Error toggling automation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to toggle automation'
      });
    }
  });

  /**
   * POST /api/automations/:id/run
   * Manually trigger an automation for a specific lead
   */
  fastify.post('/:id/run', async (request, reply) => {
    try {
      const { leadId } = request.body;

      if (!leadId) {
        return reply.code(400).send({
          success: false,
          error: 'Lead ID is required'
        });
      }

      const run = await workflowEngine.manualTrigger(
        request.params.id,
        leadId,
        request.user._id
      );

      return {
        success: true,
        data: run,
        message: 'Automation triggered successfully'
      };
    } catch (error) {
      console.error('Error triggering automation:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to trigger automation'
      });
    }
  });

  /**
   * GET /api/automations/:id/runs
   * Get run history for an automation
   */
  fastify.get('/:id/runs', async (request, reply) => {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 20;
      const skip = (page - 1) * limit;

      const runs = await AutomationRun.find({ automation: request.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('lead', 'name email phone');

      const total = await AutomationRun.countDocuments({ automation: request.params.id });

      return {
        success: true,
        data: runs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching automation runs:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch automation runs'
      });
    }
  });

  /**
   * GET /api/automations/runs/:runId
   * Get details of a specific run
   */
  fastify.get('/runs/:runId', async (request, reply) => {
    try {
      const run = await AutomationRun.findById(request.params.runId)
        .populate('automation', 'name')
        .populate('lead', 'name email phone');

      if (!run) {
        return reply.code(404).send({
          success: false,
          error: 'Run not found'
        });
      }

      return {
        success: true,
        data: run
      };
    } catch (error) {
      console.error('Error fetching run details:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch run details'
      });
    }
  });

  /**
   * POST /api/automations/runs/:runId/cancel
   * Cancel a running automation
   */
  fastify.post('/runs/:runId/cancel', async (request, reply) => {
    try {
      const run = await AutomationRun.findById(request.params.runId);

      if (!run) {
        return reply.code(404).send({
          success: false,
          error: 'Run not found'
        });
      }

      if (run.status !== 'running' && run.status !== 'paused') {
        return reply.code(400).send({
          success: false,
          error: 'Run is not active'
        });
      }

      run.status = 'cancelled';
      await run.save();

      // Cancel pending jobs
      await AutomationJob.updateMany(
        { automationRun: run._id, status: 'pending' },
        { status: 'cancelled' }
      );

      return {
        success: true,
        message: 'Automation run cancelled'
      };
    } catch (error) {
      console.error('Error cancelling run:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to cancel run'
      });
    }
  });
}

module.exports = automationRoutes;
