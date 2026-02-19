/**
 * WhatsApp Template Service
 * CRUD operations for per-org WhatsApp templates + Twilio Content API integration.
 * 
 * Flow:
 * 1. User creates template in Pulsar → saved as "draft" in MongoDB
 * 2. User submits for approval → template pushed to Twilio Content API → status becomes "pending"
 * 3. Twilio auto-approves (sandbox) or reviews → we sync status → "approved" or "rejected"
 * 4. Approved templates appear in automation builder's template picker
 */

const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const twilioService = require('./whatsapp.twilio.service');

// ─────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────

/**
 * List all templates for an organization
 */
async function listTemplates(organizationId, statusFilter = null) {
  const query = { organizationId };
  if (statusFilter && statusFilter !== 'all') {
    query.status = statusFilter;
  }
  return WhatsAppTemplate.find(query).sort({ createdAt: -1 }).lean();
}

/**
 * Get a single template by ID (scoped to org)
 */
async function getTemplate(organizationId, templateId) {
  const template = await WhatsAppTemplate.findOne({
    _id: templateId,
    organizationId
  }).lean();
  if (!template) throw new Error('Template not found');
  return template;
}

/**
 * Create a new template (saved as draft)
 */
async function createTemplate(organizationId, userId, data) {
  // Validate name format
  const safeName = data.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  
  // Check for duplicate name within org
  const existing = await WhatsAppTemplate.findOne({ organizationId, name: safeName });
  if (existing) {
    throw new Error(`Template name "${safeName}" already exists in your organization`);
  }

  const template = new WhatsAppTemplate({
    organizationId,
    name: safeName,
    friendlyName: data.friendlyName || data.name,
    category: data.category || 'UTILITY',
    language: data.language || 'en',
    contentType: data.contentType || (data.buttons && data.buttons.length > 0 ? 'quick-reply' : 'text'),
    headerText: data.headerText || '',
    body: data.body,
    footer: data.footer || '',
    buttons: (data.buttons || []).map(b => ({
      type: b.type || 'QUICK_REPLY',
      text: b.text,
      url: b.url || undefined,
      phoneNumber: b.phoneNumber || undefined
    })),
    variables: data.variables || [],
    createdBy: userId,
    status: 'draft'
  });

  await template.save();
  return template.toObject();
}

/**
 * Update a draft template
 */
async function updateTemplate(organizationId, templateId, data) {
  const template = await WhatsAppTemplate.findOne({
    _id: templateId,
    organizationId
  });
  if (!template) throw new Error('Template not found');
  if (template.status !== 'draft' && template.status !== 'rejected') {
    throw new Error('Only draft or rejected templates can be edited');
  }

  // Updatable fields
  if (data.friendlyName !== undefined) template.friendlyName = data.friendlyName;
  if (data.category !== undefined) template.category = data.category;
  if (data.language !== undefined) template.language = data.language;
  if (data.contentType !== undefined) template.contentType = data.contentType;
  if (data.headerText !== undefined) template.headerText = data.headerText;
  if (data.body !== undefined) template.body = data.body;
  if (data.footer !== undefined) template.footer = data.footer;
  if (data.buttons !== undefined) {
    template.buttons = data.buttons.map(b => ({
      type: b.type || 'QUICK_REPLY',
      text: b.text,
      url: b.url || undefined,
      phoneNumber: b.phoneNumber || undefined
    }));
    template.contentType = data.buttons.length > 0 ? 'quick-reply' : 'text';
  }
  if (data.variables !== undefined) template.variables = data.variables;

  // If re-submitting a rejected template, reset status
  if (template.status === 'rejected') {
    template.status = 'draft';
    template.rejectedReason = undefined;
    template.rejectedAt = undefined;
  }

  await template.save();
  return template.toObject();
}

/**
 * Delete a template (from DB and Twilio if applicable)
 */
async function deleteTemplate(organizationId, templateId, userId) {
  const template = await WhatsAppTemplate.findOne({
    _id: templateId,
    organizationId
  });
  if (!template) throw new Error('Template not found');

  // If it was submitted to Twilio, try to delete from Twilio too
  if (template.twilioContentSid) {
    try {
      const creds = await twilioService.getCredentials(userId);
      if (creds) {
        const twilio = require('twilio');
        const client = twilio(creds.accountSid, creds.authToken);
        await client.content.v1.contents(template.twilioContentSid).remove();
        console.log(`🗑️ Deleted Twilio Content: ${template.twilioContentSid}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to delete Twilio content ${template.twilioContentSid}:`, err.message);
      // Continue with local delete even if Twilio delete fails
    }
  }

  await WhatsAppTemplate.deleteOne({ _id: templateId, organizationId });
  return { deleted: true };
}


// ─────────────────────────────────────────────
// Twilio Content API Integration
// ─────────────────────────────────────────────

/**
 * Submit a draft template to Twilio Content API for approval
 * Twilio sandbox auto-approves content templates.
 */
async function submitForApproval(organizationId, templateId, userId) {
  const template = await WhatsAppTemplate.findOne({
    _id: templateId,
    organizationId
  });
  if (!template) throw new Error('Template not found');
  if (template.status !== 'draft' && template.status !== 'rejected') {
    throw new Error('Only draft or rejected templates can be submitted');
  }

  const creds = await twilioService.getCredentials(userId);
  if (!creds) throw new Error('Twilio credentials not configured. Go to Settings → WhatsApp to set up.');

  // Build Twilio Content API payload
  const contentPayload = buildTwilioContentPayload(template);

  // Call Twilio Content API
  const twilio = require('twilio');
  const client = twilio(creds.accountSid, creds.authToken);

  try {
    const contentResource = await client.content.v1.contents.create(contentPayload);
    
    console.log(`📝 Twilio Content created: ${contentResource.sid} for template "${template.name}"`);

    // Update local template
    template.twilioContentSid = contentResource.sid;
    template.approvalSubmittedAt = new Date();

    // Twilio sandbox auto-approves content templates instantly
    // Production accounts may require manual approval
    // We'll mark as approved immediately for sandbox, and sync can update later if needed
    template.status = 'approved';
    template.approvedAt = new Date();
    console.log(`✅ Template marked as approved (Twilio sandbox auto-approves content)`);

    await template.save();
    return template.toObject();
  } catch (err) {
    console.error('❌ Twilio Content API error:', err.message);
    
    // If we get a 409 (already exists), try to find the SID
    if (err.status === 409) {
      template.status = 'rejected';
      template.rejectedReason = 'A template with this name already exists in Twilio. Please use a different name.';
      template.rejectedAt = new Date();
      await template.save();
    }
    
    throw new Error(`Twilio Content API error: ${err.message}`);
  }
}

/**
 * Build the Twilio Content API payload from our template
 */
function buildTwilioContentPayload(template) {
  const payload = {
    friendlyName: template.friendlyName,
    language: template.language || 'en',
    variables: {},
    types: {}
  };

  // Build variables map
  if (template.variables && template.variables.length > 0) {
    template.variables.forEach(v => {
      payload.variables[String(v.index)] = v.sample || `{{${v.index}}}`;
    });
  }

  // Build content type based on template type
  if (template.contentType === 'quick-reply' && template.buttons.length > 0) {
    payload.types['twilio/quick-reply'] = {
      body: template.body,
      actions: template.buttons.map(btn => ({
        title: btn.text,
        id: btn.text.toLowerCase().replace(/\s+/g, '_')
      }))
    };
  } else if (template.contentType === 'card') {
    payload.types['twilio/card'] = {
      title: template.headerText || '',
      body: template.body,
      actions: (template.buttons || []).map(btn => ({
        title: btn.text,
        id: btn.text.toLowerCase().replace(/\s+/g, '_'),
        type: 'QUICK_REPLY'
      }))
    };
  } else {
    // Plain text
    payload.types['twilio/text'] = {
      body: template.body
    };
  }

  return payload;
}

/**
 * Sync template statuses from Twilio Content API
 * Checks all pending templates and updates their approval status
 */
async function syncTemplates(organizationId, userId) {
  const creds = await twilioService.getCredentials(userId);
  if (!creds) throw new Error('Twilio credentials not configured');

  const twilio = require('twilio');
  const client = twilio(creds.accountSid, creds.authToken);

  // Fetch all content from Twilio
  const twilioContents = await client.content.v1.contents.list({ limit: 100 });
  const twilioMap = new Map(twilioContents.map(c => [c.sid, c]));

  // Find all pending templates for this org
  const pendingTemplates = await WhatsAppTemplate.find({
    organizationId,
    status: 'pending',
    twilioContentSid: { $ne: null }
  });

  const results = { updated: 0, approved: 0, rejected: 0 };

  for (const template of pendingTemplates) {
    const twilioContent = twilioMap.get(template.twilioContentSid);
    
    if (twilioContent) {
      // Content exists in Twilio — check approval
      try {
        const approvalStatus = await client.content.v1
          .contents(template.twilioContentSid)
          .approvalFetch()
          .fetch();
        
        if (approvalStatus.status === 'approved') {
          template.status = 'approved';
          template.approvedAt = new Date();
          results.approved++;
        } else if (approvalStatus.status === 'rejected') {
          template.status = 'rejected';
          template.rejectedReason = approvalStatus.rejectionReason || 'Rejected by Twilio';
          template.rejectedAt = new Date();
          results.rejected++;
        }
      } catch (approvalErr) {
        // Sandbox doesn't have approval endpoint — assume approved
        template.status = 'approved';
        template.approvedAt = new Date();
        results.approved++;
      }
      
      await template.save();
      results.updated++;
    } else {
      // Content was deleted from Twilio
      template.status = 'rejected';
      template.rejectedReason = 'Content no longer exists in Twilio';
      template.rejectedAt = new Date();
      await template.save();
      results.updated++;
      results.rejected++;
    }
  }

  // Also import any Twilio templates not yet in our DB
  const existingContentSids = new Set(
    (await WhatsAppTemplate.find({ organizationId, twilioContentSid: { $ne: null } }))
      .map(t => t.twilioContentSid)
  );

  let imported = 0;
  for (const [sid, content] of twilioMap) {
    if (!existingContentSids.has(sid)) {
      // Check if it's a WhatsApp-compatible template
      if (content.types && (content.types['twilio/text'] || content.types['twilio/quick-reply'] || content.types['twilio/card'])) {
        try {
          const buttons = [];
          let body = '';
          let contentType = 'text';
          let headerText = '';

          if (content.types['twilio/quick-reply']) {
            body = content.types['twilio/quick-reply'].body || '';
            contentType = 'quick-reply';
            if (content.types['twilio/quick-reply'].actions) {
              content.types['twilio/quick-reply'].actions.forEach(a => {
                buttons.push({ type: 'QUICK_REPLY', text: a.title || a.id });
              });
            }
          } else if (content.types['twilio/card']) {
            body = content.types['twilio/card'].body || '';
            headerText = content.types['twilio/card'].title || '';
            contentType = 'card';
            if (content.types['twilio/card'].actions) {
              content.types['twilio/card'].actions.forEach(a => {
                buttons.push({ type: 'QUICK_REPLY', text: a.title || a.id });
              });
            }
          } else if (content.types['twilio/text']) {
            body = content.types['twilio/text'].body || '';
          }

          const safeName = (content.friendlyName || sid)
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')
            .replace(/^[^a-z]/, 'tpl_');
          
          // Avoid duplicate names
          const nameExists = await WhatsAppTemplate.findOne({ organizationId, name: safeName });
          if (nameExists) continue;

          await WhatsAppTemplate.create({
            organizationId,
            name: safeName,
            friendlyName: content.friendlyName || sid,
            twilioContentSid: sid,
            status: 'approved',
            category: 'UTILITY',
            language: content.language || 'en',
            contentType,
            headerText,
            body,
            buttons,
            createdBy: userId,
            approvedAt: new Date()
          });
          imported++;
        } catch (importErr) {
          console.warn(`⚠️ Failed to import Twilio template ${sid}:`, importErr.message);
        }
      }
    }
  }

  results.imported = imported;
  return results;
}

/**
 * Get approved templates for an org — Used by automation builder
 */
async function getApprovedTemplates(organizationId) {
  const templates = await WhatsAppTemplate.find({
    organizationId,
    status: 'approved'
  }).sort({ name: 1 }).lean();

  // Map to the format expected by the automation builder (same format as Twilio getTemplates)
  return templates.map(t => {
    const buttons = (t.buttons || []).map(b => ({
      type: b.type || 'QUICK_REPLY',
      text: b.text,
      payload: b.text.toLowerCase().replace(/\s+/g, '_')
    }));

    const components = [];
    if (t.headerText) {
      components.push({ type: 'HEADER', text: t.headerText });
    }
    if (t.body) {
      components.push({ type: 'BODY', text: t.body });
    }
    if (t.footer) {
      components.push({ type: 'FOOTER', text: t.footer });
    }

    return {
      id: t.twilioContentSid || t._id.toString(),
      name: t.friendlyName || t.name,
      status: 'APPROVED',
      category: t.category,
      language: t.language,
      components,
      buttons
    };
  });
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
