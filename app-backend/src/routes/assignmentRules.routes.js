/**
 * Assignment Rules Routes
 * Fastify plugin for lead assignment rule CRUD.
 * Prefix: /api/assignment-rules
 */

const assignmentRulesController = require('../controllers/assignmentRules.controller');
const { requireRole } = require('../middleware/roles');

async function assignmentRulesRoutes(fastify, options) {
    // Create rule (owner/admin/manager)
    fastify.post('/', {
        preHandler: requireRole(['owner', 'admin', 'manager'])
    }, assignmentRulesController.createRule);

    // List rules
    fastify.get('/', assignmentRulesController.getRules);

    // Get single rule
    fastify.get('/:id', assignmentRulesController.getRuleById);

    // Update rule (owner/admin/manager)
    fastify.put('/:id', {
        preHandler: requireRole(['owner', 'admin', 'manager'])
    }, assignmentRulesController.updateRule);

    // Delete rule (owner/admin)
    fastify.delete('/:id', {
        preHandler: requireRole(['owner', 'admin'])
    }, assignmentRulesController.deleteRule);

    // Toggle rule active/inactive (owner/admin/manager)
    fastify.patch('/:id/toggle', {
        preHandler: requireRole(['owner', 'admin', 'manager'])
    }, assignmentRulesController.toggleRule);
}

module.exports = assignmentRulesRoutes;
