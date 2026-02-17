/**
 * Broadcast Controller
 * Handles WhatsApp broadcast campaigns with image + CTA buttons
 */

const Broadcast = require('../models/Broadcast');
const Lead = require('../models/Lead');
const whatsappService = require('../services/whatsapp.service');

/**
 * Get all broadcasts for the user
 */
async function getBroadcasts(request, reply) {
  try {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const { status, page = 1, limit = 20 } = request.query;
    
    const query = { createdBy: userId };
    // Multi-tenancy: scope to organization
    if (organizationId) {
      query.organizationId = organizationId;
    }
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const [broadcasts, total] = await Promise.all([
      Broadcast.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Broadcast.countDocuments(query)
    ]);
    
    return reply.send({
      success: true,
      data: broadcasts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching broadcasts:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch broadcasts'
    });
  }
}

/**
 * Get single broadcast by ID
 */
async function getBroadcastById(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    
    const broadcast = await Broadcast.findOne({ _id: id, createdBy: userId }).lean();
    
    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    return reply.send({
      success: true,
      data: broadcast
    });
  } catch (error) {
    console.error('Error fetching broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch broadcast'
    });
  }
}

/**
 * Create a new broadcast (draft)
 */
async function createBroadcast(request, reply) {
  try {
    const userId = request.user._id;
    const { name, message, imageUrl, headerText, footerText, buttons, targetFilter, scheduledAt } = request.body;
    
    // Validate required fields
    if (!name || !message) {
      return reply.status(400).send({
        success: false,
        error: 'Name and message are required'
      });
    }
    
    // Validate buttons (max 2 CTA buttons)
    if (buttons && buttons.length > 2) {
      return reply.status(400).send({
        success: false,
        error: 'Maximum 2 CTA buttons allowed'
      });
    }
    
    // Validate button structure
    if (buttons) {
      for (const btn of buttons) {
        if (btn.type === 'call' && !btn.phoneNumber) {
          return reply.status(400).send({
            success: false,
            error: 'Phone number required for call button'
          });
        }
        if (btn.type === 'url' && !btn.url) {
          return reply.status(400).send({
            success: false,
            error: 'URL required for website button'
          });
        }
        if (!btn.text || btn.text.length > 20) {
          return reply.status(400).send({
            success: false,
            error: 'Button text required (max 20 characters)'
          });
        }
      }
    }
    
    const broadcast = new Broadcast({
      name,
      message,
      imageUrl,
      headerText,
      footerText,
      buttons: buttons || [],
      targetFilter,
      scheduledAt,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdBy: userId,
      organizationId: request.user.organizationId
    });
    
    await broadcast.save();
    
    return reply.status(201).send({
      success: true,
      data: broadcast,
      message: 'Broadcast created successfully'
    });
  } catch (error) {
    console.error('Error creating broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to create broadcast'
    });
  }
}

/**
 * Update a broadcast (only if draft)
 */
async function updateBroadcast(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    const updates = request.body;
    
    const broadcast = await Broadcast.findOne({ _id: id, createdBy: userId });
    
    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return reply.status(400).send({
        success: false,
        error: 'Cannot update broadcast that has been sent'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['name', 'message', 'imageUrl', 'headerText', 'footerText', 'buttons', 'targetFilter', 'scheduledAt'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        broadcast[key] = updates[key];
      }
    }
    
    await broadcast.save();
    
    return reply.send({
      success: true,
      data: broadcast,
      message: 'Broadcast updated successfully'
    });
  } catch (error) {
    console.error('Error updating broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to update broadcast'
    });
  }
}

/**
 * Delete a broadcast
 */
async function deleteBroadcast(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    
    const broadcast = await Broadcast.findOne({ _id: id, createdBy: userId });
    
    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    if (broadcast.status === 'sending') {
      return reply.status(400).send({
        success: false,
        error: 'Cannot delete broadcast while sending'
      });
    }
    
    await Broadcast.deleteOne({ _id: id });
    
    return reply.send({
      success: true,
      message: 'Broadcast deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete broadcast'
    });
  }
}

/**
 * Get target leads count based on filter
 */
async function getTargetLeadsCount(request, reply) {
  try {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const { status, source, tags, assignedTo } = request.query;
    
    const query = { phone: { $exists: true, $ne: '' } };
    // Multi-tenancy: scope to organization
    if (organizationId) {
      query.organizationId = organizationId;
    }
    
    if (status) {
      query.status = { $in: status.split(',') };
    }
    if (source) {
      query.source = { $in: source.split(',') };
    }
    if (tags) {
      query.tags = { $in: tags.split(',') };
    }
    if (assignedTo) {
      query.assignedTo = { $in: assignedTo.split(',') };
    }
    
    const count = await Lead.countDocuments(query);
    
    return reply.send({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error counting leads:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to count leads'
    });
  }
}

/**
 * Send broadcast to all leads
 */
async function sendBroadcast(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    
    const broadcast = await Broadcast.findOne({ _id: id, createdBy: userId });
    
    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    if (broadcast.status === 'sending' || broadcast.status === 'sent') {
      return reply.status(400).send({
        success: false,
        error: 'Broadcast already sent or in progress'
      });
    }
    
    // Build lead query based on target filter
    const leadQuery = { phone: { $exists: true, $ne: '' } };
    // Multi-tenancy: scope to organization
    if (request.user.organizationId) {
      leadQuery.organizationId = request.user.organizationId;
    }
    
    if (broadcast.targetFilter) {
      if (broadcast.targetFilter.status?.length > 0) {
        leadQuery.status = { $in: broadcast.targetFilter.status };
      }
      if (broadcast.targetFilter.source?.length > 0) {
        leadQuery.source = { $in: broadcast.targetFilter.source };
      }
      if (broadcast.targetFilter.tags?.length > 0) {
        leadQuery.tags = { $in: broadcast.targetFilter.tags };
      }
      if (broadcast.targetFilter.assignedTo?.length > 0) {
        leadQuery.assignedTo = { $in: broadcast.targetFilter.assignedTo };
      }
    }
    
    // Get all target leads
    const leads = await Lead.find(leadQuery).select('_id name phone').lean();
    
    if (leads.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'No leads found with valid phone numbers'
      });
    }
    
    // Update broadcast status
    broadcast.status = 'sending';
    broadcast.startedAt = new Date();
    broadcast.stats.totalLeads = leads.length;
    broadcast.deliveryStatus = leads.map(lead => ({
      leadId: lead._id,
      leadName: lead.name,
      phone: lead.phone,
      status: 'pending'
    }));
    await broadcast.save();
    
    // Send immediately (reply first, process in background)
    reply.send({
      success: true,
      message: `Sending broadcast to ${leads.length} leads...`,
      data: {
        broadcastId: broadcast._id,
        totalLeads: leads.length
      }
    });
    
    // Process in background
    processBroadcast(broadcast, leads).catch(err => {
      console.error('Broadcast processing error:', err);
    });
    
  } catch (error) {
    console.error('Error sending broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to send broadcast'
    });
  }
}

/**
 * Process broadcast sending in background
 */
async function processBroadcast(broadcast, leads) {
  let sent = 0;
  let failed = 0;
  
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    
    try {
      // Send WhatsApp message with image and CTA buttons
      const result = await whatsappService.sendImageWithCTA(
        lead.phone,
        broadcast.imageUrl,
        broadcast.message,
        broadcast.buttons,
        {
          headerText: broadcast.headerText,
          footerText: broadcast.footerText
        }
      );
      
      if (result.success) {
        sent++;
        // Update delivery status for this lead
        await Broadcast.updateOne(
          { _id: broadcast._id, 'deliveryStatus.leadId': lead._id },
          {
            $set: {
              'deliveryStatus.$.status': 'sent',
              'deliveryStatus.$.messageId': result.messageId,
              'deliveryStatus.$.sentAt': new Date()
            },
            $inc: { 'stats.sent': 1 }
          }
        );
      } else {
        throw new Error(result.error || 'Send failed');
      }
    } catch (error) {
      failed++;
      console.error(`Failed to send to ${lead.phone}:`, error.message);
      
      await Broadcast.updateOne(
        { _id: broadcast._id, 'deliveryStatus.leadId': lead._id },
        {
          $set: {
            'deliveryStatus.$.status': 'failed',
            'deliveryStatus.$.error': error.message
          },
          $inc: { 'stats.failed': 1 }
        }
      );
    }
    
    // Rate limiting: wait 100ms between messages to avoid API throttling
    if (i < leads.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Mark broadcast as complete
  await Broadcast.updateOne(
    { _id: broadcast._id },
    {
      $set: {
        status: failed === leads.length ? 'failed' : 'sent',
        completedAt: new Date()
      }
    }
  );
  
  console.log(`Broadcast ${broadcast._id} completed: ${sent} sent, ${failed} failed`);
}

/**
 * Get broadcast delivery status
 */
async function getBroadcastStatus(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    
    const broadcast = await Broadcast.findOne(
      { _id: id, createdBy: userId },
      { name: 1, status: 1, stats: 1, startedAt: 1, completedAt: 1, deliveryStatus: 1 }
    ).lean();
    
    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    return reply.send({
      success: true,
      data: {
        id: broadcast._id,
        name: broadcast.name,
        status: broadcast.status,
        stats: broadcast.stats,
        startedAt: broadcast.startedAt,
        completedAt: broadcast.completedAt,
        deliveryRate: broadcast.stats.totalLeads > 0 
          ? Math.round((broadcast.stats.sent / broadcast.stats.totalLeads) * 100) 
          : 0,
        // Include first 50 delivery details
        recentDeliveries: broadcast.deliveryStatus?.slice(0, 50)
      }
    });
  } catch (error) {
    console.error('Error fetching broadcast status:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch broadcast status'
    });
  }
}

/**
 * Duplicate a broadcast
 */
async function duplicateBroadcast(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user._id;
    
    const original = await Broadcast.findOne({ _id: id, createdBy: userId }).lean();
    
    if (!original) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found'
      });
    }
    
    const duplicate = new Broadcast({
      name: `${original.name} (Copy)`,
      message: original.message,
      imageUrl: original.imageUrl,
      headerText: original.headerText,
      footerText: original.footerText,
      buttons: original.buttons,
      targetFilter: original.targetFilter,
      status: 'draft',
      createdBy: userId,
      organizationId: request.user.organizationId
    });
    
    await duplicate.save();
    
    return reply.status(201).send({
      success: true,
      data: duplicate,
      message: 'Broadcast duplicated successfully'
    });
  } catch (error) {
    console.error('Error duplicating broadcast:', error);
    return reply.status(500).send({
      success: false,
      error: 'Failed to duplicate broadcast'
    });
  }
}

module.exports = {
  getBroadcasts,
  getBroadcastById,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  getTargetLeadsCount,
  sendBroadcast,
  getBroadcastStatus,
  duplicateBroadcast
};
