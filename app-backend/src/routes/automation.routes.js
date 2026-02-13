/**
 * Automation Routes for Fastify
 */

const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const workflowEngine = require('../services/workflow.engine');
const defaultAutomationTemplate = require('../config/defaultAutomationTemplate');

async function automationRoutes(fastify, options) {
  const { requireRole } = require('../middleware/roles');

  /**
   * GET /api/automations/templates
   * Get available automation templates
   */
  fastify.get('/templates', async (request, reply) => {
    try {
      const templates = [
        {
          id: 'jk-lead-nurturing',
          name: defaultAutomationTemplate.name,
          description: defaultAutomationTemplate.description,
          nodeCount: defaultAutomationTemplate.nodes.length,
          isDefault: true,
          category: 'Lead Nurturing'
        }
      ];

      return {
        success: true,
        data: templates
      };
    } catch (error) {
      console.error('Error fetching templates:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch templates'
      });
    }
  });

  /**
   * GET /api/automations/templates/:templateId
   * Get a specific template's full data
   */
  fastify.get('/templates/:templateId', async (request, reply) => {
    try {
      const { templateId } = request.params;

      if (templateId === 'jk-lead-nurturing') {
        return {
          success: true,
          data: {
            id: 'jk-lead-nurturing',
            ...defaultAutomationTemplate
          }
        };
      }

      return reply.code(404).send({
        success: false,
        error: 'Template not found'
      });
    } catch (error) {
      console.error('Error fetching template:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch template'
      });
    }
  });

  /**
   * POST /api/automations/templates/:templateId/load
   * Load a template as a new automation
   */
  fastify.post('/templates/:templateId/load', async (request, reply) => {
    try {
      const { templateId } = request.params;
      const { name } = request.body;

      let templateData;
      if (templateId === 'jk-lead-nurturing') {
        templateData = defaultAutomationTemplate;
      } else {
        return reply.code(404).send({
          success: false,
          error: 'Template not found'
        });
      }

      // Get user ID if available
      const ownerId = request.user?._id || null;

      // Find trigger node to determine trigger type
      const triggerNode = templateData.nodes.find(n => n.type === 'trigger');
      const triggerType = triggerNode?.data?.type || 'newLead';

      const automation = new Automation({
        name: name || templateData.name,
        description: templateData.description,
        owner: ownerId,
        organizationId: request.user?.organizationId,
        nodes: templateData.nodes,
        edges: templateData.edges,
        isActive: false, // Start as inactive so user can review
        triggerType
      });

      await automation.save();

      console.log(`✅ Template loaded as automation: ${automation.name}`);

      return reply.code(201).send({
        success: true,
        data: automation,
        message: 'Template loaded successfully'
      });
    } catch (error) {
      console.error('Error loading template:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to load template'
      });
    }
  });

  /**
   * POST /api/automations/:id/duplicate
   * Duplicate an existing automation
   */
  fastify.post('/:id/duplicate', async (request, reply) => {
    try {
      const originalAutomation = await Automation.findById(request.params.id);

      if (!originalAutomation) {
        return reply.code(404).send({
          success: false,
          error: 'Automation not found'
        });
      }

      // Verify org ownership
      if (request.user?.organizationId && originalAutomation.organizationId &&
          originalAutomation.organizationId.toString() !== request.user.organizationId.toString()) {
        return reply.code(404).send({ success: false, error: 'Automation not found' });
      }

      const { name } = request.body;
      const ownerId = request.user?._id || originalAutomation.owner;

      // Create duplicate with modified name
      const duplicateData = {
        name: name || `${originalAutomation.name} (Copy)`,
        description: originalAutomation.description,
        owner: ownerId,
        organizationId: request.user?.organizationId || originalAutomation.organizationId,
        nodes: originalAutomation.nodes.map(node => ({
          ...node,
          id: `${node.id}-${Date.now()}` // Generate new IDs
        })),
        edges: originalAutomation.edges.map(edge => ({
          ...edge,
          id: `${edge.id}-${Date.now()}`,
          source: `${edge.source}-${Date.now()}`,
          target: `${edge.target}-${Date.now()}`
        })),
        isActive: false, // Start as inactive
        triggerType: originalAutomation.triggerType,
        triggerConditions: originalAutomation.triggerConditions
      };

      // Fix edge references to match new node IDs
      const nodeIdMap = {};
      originalAutomation.nodes.forEach((node, index) => {
        nodeIdMap[node.id] = duplicateData.nodes[index].id;
      });

      duplicateData.edges = originalAutomation.edges.map(edge => ({
        ...edge,
        id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source: nodeIdMap[edge.source] || edge.source,
        target: nodeIdMap[edge.target] || edge.target
      }));

      const duplicate = new Automation(duplicateData);
      await duplicate.save();

      console.log(`✅ Automation duplicated: ${originalAutomation.name} → ${duplicate.name}`);

      return reply.code(201).send({
        success: true,
        data: duplicate,
        message: 'Automation duplicated successfully'
      });
    } catch (error) {
      console.error('Error duplicating automation:', error);
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to duplicate automation'
      });
    }
  });

  /**
   * GET /api/automations
   * Get all automations for the current user/company
   */
  fastify.get('/', async (request, reply) => {
    try {
      // Handle case where user might not be set (for development)
      const userId = request.user?._id;
      const userRole = request.user?.role;
      const organizationId = request.user?.organizationId;
      
      const query = {};
      // Scope to organization
      if (organizationId) {
        query.organizationId = organizationId;
      }
      // Non-admin/owners can only see their own
      if (userId && userRole !== 'admin' && userRole !== 'owner') {
        query.owner = userId;
      }

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
      const findQuery = { _id: request.params.id };
      if (request.user?.organizationId) {
        findQuery.organizationId = request.user.organizationId;
      }
      const automation = await Automation.findOne(findQuery)
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
        organizationId: request.user?.organizationId,
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
      const findQuery = { _id: request.params.id };
      if (request.user?.organizationId) {
        findQuery.organizationId = request.user.organizationId;
      }
      const automation = await Automation.findOne(findQuery);

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
      const findQuery = { _id: request.params.id };
      if (request.user?.organizationId) {
        findQuery.organizationId = request.user.organizationId;
      }
      const automation = await Automation.findOne(findQuery);

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
      const findQuery = { _id: request.params.id };
      if (request.user?.organizationId) {
        findQuery.organizationId = request.user.organizationId;
      }
      const automation = await Automation.findOne(findQuery);

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

  // ==========================================
  // MAINTENANCE ENDPOINTS (Issue #7, #8)
  // ==========================================

  /**
   * GET /api/automations/maintenance/cleanup-stats
   * Get statistics about records that would be deleted by cleanup
   */
  fastify.get('/maintenance/cleanup-stats', {
    preHandler: [requireRole(['admin', 'owner'])]
  }, async (request, reply) => {
    try {
      const daysToKeep = parseInt(request.query.days) || 30;
      const failedDaysToKeep = parseInt(request.query.failedDays) || 90;
      
      const stats = await workflowEngine.getCleanupStats(daysToKeep, failedDaysToKeep);
      
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('Error getting cleanup stats:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/automations/maintenance/cleanup
   * Run cleanup to delete old automation runs and jobs
   */
  fastify.post('/maintenance/cleanup', {
    preHandler: [requireRole(['admin', 'owner'])]
  }, async (request, reply) => {
    try {
      const daysToKeep = parseInt(request.body.days) || 30;
      const failedDaysToKeep = parseInt(request.body.failedDays) || 90;
      
      const result = await workflowEngine.cleanupOldRuns(daysToKeep, failedDaysToKeep);
      
      return {
        success: result.success,
        data: result.deleted,
        error: result.error
      };
    } catch (error) {
      console.error('Error running cleanup:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/automations/maintenance/recover
   * Recover stuck automations
   */
  fastify.post('/maintenance/recover', {
    preHandler: [requireRole(['admin', 'owner'])]
  }, async (request, reply) => {
    try {
      const stuckThresholdHours = parseInt(request.body.hours) || 24;
      
      const result = await workflowEngine.recoverStuckAutomations(stuckThresholdHours);
      
      return {
        success: result.success,
        data: {
          found: result.found,
          recovered: result.recovered,
          failed: result.failed
        },
        error: result.error
      };
    } catch (error) {
      console.error('Error recovering automations:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/automations/maintenance/status
   * Get overall automation system health status
   */
  fastify.get('/maintenance/status', async (request, reply) => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now - 60 * 60 * 1000);

      // Get counts
      const [
        totalRuns,
        activeRuns,
        completedToday,
        failedToday,
        stuckRuns,
        pendingJobs,
        waitingForResponse
      ] = await Promise.all([
        AutomationRun.countDocuments(),
        AutomationRun.countDocuments({ status: 'running' }),
        AutomationRun.countDocuments({ status: 'completed', completedAt: { $gte: oneDayAgo } }),
        AutomationRun.countDocuments({ status: 'failed', updatedAt: { $gte: oneDayAgo } }),
        AutomationRun.countDocuments({ 
          status: { $in: ['running', 'waiting_for_response'] },
          updatedAt: { $lt: oneHourAgo }
        }),
        AutomationJob.countDocuments({ status: 'pending' }),
        AutomationRun.countDocuments({ status: 'waiting_for_response' })
      ]);

      const health = stuckRuns > 5 ? 'critical' : 
                     stuckRuns > 0 ? 'warning' : 
                     failedToday > 10 ? 'warning' : 'healthy';

      return {
        success: true,
        data: {
          health,
          stats: {
            totalRuns,
            activeRuns,
            completedToday,
            failedToday,
            stuckRuns,
            pendingJobs,
            waitingForResponse
          },
          recommendations: [
            ...(stuckRuns > 0 ? [`${stuckRuns} automations appear stuck - consider running recovery`] : []),
            ...(failedToday > 10 ? [`${failedToday} failures today - check error logs`] : []),
            ...(pendingJobs > 100 ? [`${pendingJobs} pending jobs - system may be overloaded`] : [])
          ],
          timestamp: now.toISOString()
        }
      };
    } catch (error) {
      console.error('Error getting maintenance status:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = automationRoutes;
