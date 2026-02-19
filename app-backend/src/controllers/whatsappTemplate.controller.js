/**
 * WhatsApp Template Controller
 * Handles CRUD operations for per-org WhatsApp templates
 */

const templateService = require('../services/whatsappTemplate.service');

/**
 * GET /api/whatsapp-templates
 * List all templates for the user's organization
 */
async function listTemplates(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    if (!organizationId) {
      return reply.code(400).send({ success: false, error: 'Organization not found' });
    }

    const status = request.query.status || null; // 'draft', 'pending', 'approved', 'rejected', or null for all
    const templates = await templateService.listTemplates(organizationId, status);
    return reply.send({ success: true, data: templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return reply.code(500).send({ success: false, error: error.message });
  }
}

/**
 * GET /api/whatsapp-templates/:id
 * Get a single template
 */
async function getTemplate(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const template = await templateService.getTemplate(organizationId, request.params.id);
    return reply.send({ success: true, data: template });
  } catch (error) {
    console.error('Error getting template:', error);
    return reply.code(404).send({ success: false, error: error.message });
  }
}

/**
 * POST /api/whatsapp-templates
 * Create a new template (draft)
 */
async function createTemplate(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const userId = request.user.id || request.user._id;
    
    if (!organizationId) {
      return reply.code(400).send({ success: false, error: 'Organization not found' });
    }

    const { name, friendlyName, category, language, contentType, headerText, body, footer, buttons, variables } = request.body;

    if (!name || !body) {
      return reply.code(400).send({ success: false, error: 'Template name and body are required' });
    }

    const template = await templateService.createTemplate(organizationId, userId, {
      name,
      friendlyName: friendlyName || name,
      category,
      language,
      contentType,
      headerText,
      body,
      footer,
      buttons,
      variables
    });

    return reply.code(201).send({ success: true, data: template });
  } catch (error) {
    console.error('Error creating template:', error);
    const code = error.message.includes('already exists') ? 409 : 500;
    return reply.code(code).send({ success: false, error: error.message });
  }
}

/**
 * PUT /api/whatsapp-templates/:id
 * Update a draft/rejected template
 */
async function updateTemplate(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const template = await templateService.updateTemplate(organizationId, request.params.id, request.body);
    return reply.send({ success: true, data: template });
  } catch (error) {
    console.error('Error updating template:', error);
    const code = error.message.includes('not found') ? 404 : 400;
    return reply.code(code).send({ success: false, error: error.message });
  }
}

/**
 * DELETE /api/whatsapp-templates/:id
 * Delete a template
 */
async function deleteTemplate(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const userId = request.user.id || request.user._id;
    const result = await templateService.deleteTemplate(organizationId, request.params.id, userId);
    return reply.send({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting template:', error);
    return reply.code(404).send({ success: false, error: error.message });
  }
}

/**
 * POST /api/whatsapp-templates/:id/submit
 * Submit a draft template to Twilio Content API for approval
 */
async function submitForApproval(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const userId = request.user.id || request.user._id;
    const template = await templateService.submitForApproval(organizationId, request.params.id, userId);
    return reply.send({ success: true, data: template });
  } catch (error) {
    console.error('Error submitting template for approval:', error);
    return reply.code(400).send({ success: false, error: error.message });
  }
}

/**
 * POST /api/whatsapp-templates/sync
 * Sync template statuses from Twilio Content API + import missing
 */
async function syncTemplates(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    const userId = request.user.id || request.user._id;
    
    if (!organizationId) {
      return reply.code(400).send({ success: false, error: 'Organization not found' });
    }

    const results = await templateService.syncTemplates(organizationId, userId);
    return reply.send({ success: true, data: results });
  } catch (error) {
    console.error('Error syncing templates:', error);
    return reply.code(500).send({ success: false, error: error.message });
  }
}

/**
 * GET /api/whatsapp-templates/approved
 * Get only approved templates (for automation builder dropdown)
 */
async function getApprovedTemplates(request, reply) {
  try {
    const organizationId = request.user.organizationId;
    if (!organizationId) {
      return reply.code(400).send({ success: false, error: 'Organization not found' });
    }

    const templates = await templateService.getApprovedTemplates(organizationId);
    return reply.send({ success: true, data: templates });
  } catch (error) {
    console.error('Error getting approved templates:', error);
    return reply.code(500).send({ success: false, error: error.message });
  }
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  submitForApproval,
  syncTemplates,
  getApprovedTemplates
};
