/**
 * Assignment Rules Controller
 * HTTP handlers for lead assignment rule CRUD.
 */

const assignmentRulesService = require('../services/assignmentRules.service');

/**
 * POST /api/assignment-rules
 */
async function createRule(request, reply) {
    const creator = {
        id: request.user.id || request.user._id,
        organizationId: request.user.organizationId
    };

    const rule = await assignmentRulesService.createRule(request.body, creator);
    return reply.code(201).send({ success: true, data: rule });
}

/**
 * GET /api/assignment-rules
 * Query: ?includeInactive=true
 */
async function getRules(request, reply) {
    const organizationId = request.user.organizationId;
    const { includeInactive } = request.query;

    const rules = await assignmentRulesService.getRules(organizationId, {
        includeInactive: includeInactive === 'true'
    });

    return reply.code(200).send({ success: true, data: rules });
}

/**
 * GET /api/assignment-rules/:id
 */
async function getRuleById(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const rule = await assignmentRulesService.getRuleById(id, organizationId);
    return reply.code(200).send({ success: true, data: rule });
}

/**
 * PUT /api/assignment-rules/:id
 */
async function updateRule(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const rule = await assignmentRulesService.updateRule(id, organizationId, request.body);
    return reply.code(200).send({ success: true, data: rule });
}

/**
 * DELETE /api/assignment-rules/:id
 */
async function deleteRule(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const result = await assignmentRulesService.deleteRule(id, organizationId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * PATCH /api/assignment-rules/:id/toggle
 */
async function toggleRule(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const rule = await assignmentRulesService.toggleRule(id, organizationId);
    return reply.code(200).send({ success: true, data: rule });
}

module.exports = {
    createRule,
    getRules,
    getRuleById,
    updateRule,
    deleteRule,
    toggleRule
};
