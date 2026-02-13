/**
 * Zoho Sync Controller
 * API endpoints for manual sync operations
 */

const zohoSyncService = require('../sync/zoho.sync.service');

/**
 * Sync a specific CallLog to Zoho
 */
async function syncCallLog(request, reply) {
  const { callLogId } = request.params;
  
  const result = await zohoSyncService.syncCallLogToZoho(callLogId);
  
  if (result.success) {
    return reply.send({
      success: true,
      message: 'CallLog synced successfully',
      data: result
    });
  } else {
    return reply.status(400).send({
      success: false,
      error: result.error
    });
  }
}

/**
 * Sync a specific Activity to Zoho
 */
async function syncActivity(request, reply) {
  const { activityId } = request.params;
  
  const result = await zohoSyncService.syncActivityToZoho(activityId);
  
  if (result.success) {
    return reply.send({
      success: true,
      message: 'Activity synced successfully',
      data: result
    });
  } else {
    return reply.status(400).send({
      success: false,
      error: result.error
    });
  }
}

/**
 * Sync a specific appointment (SiteVisit) to Zoho
 */
async function syncSiteVisit(request, reply) {
  const { siteVisitId } = request.params;
  
  const result = await zohoSyncService.syncSiteVisitToZoho(siteVisitId);
  
  if (result.success) {
    return reply.send({
      success: true,
      message: 'Appointment synced successfully',
      data: result
    });
  } else {
    return reply.status(400).send({
      success: false,
      error: result.error
    });
  }
}

/**
 * Sync all pending entities to Zoho
 */
async function syncAllPending(request, reply) {
  const { type = 'all', limit = 50 } = request.query;
  
  const result = await zohoSyncService.syncPendingToZoho(type, parseInt(limit));
  
  return reply.send({
    success: result.success,
    message: 'Sync operation completed',
    data: result
  });
}

/**
 * Import leads from Zoho CRM into MongoDB
 */
async function importFromZoho(request, reply) {
  const { maxPages = 10, perPage = 200 } = request.query;

  const result = await zohoSyncService.importLeadsFromZoho({
    maxPages: parseInt(maxPages),
    perPage: parseInt(perPage)
  });

  if (result.success) {
    return reply.send({
      success: true,
      message: `Imported ${result.created} new leads, updated ${result.updated} existing leads from Zoho CRM`,
      data: result
    });
  } else {
    return reply.status(500).send({
      success: false,
      error: result.error,
      data: result
    });
  }
}

module.exports = {
  syncCallLog,
  syncActivity,
  syncSiteVisit,
  syncAllPending,
  importFromZoho
};
