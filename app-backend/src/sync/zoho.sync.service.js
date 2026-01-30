/**
 * Zoho CRM Sync Service
 * Handles bidirectional synchronization between MongoDB and Zoho CRM
 */

const CallLog = require('../models/CallLog');
const Activity = require('../models/Activity');
const SiteVisit = require('../models/SiteVisit');
const zohoClient = require('../clients/zoho.client');

/**
 * Sync a CallLog entry to Zoho CRM as a call activity
 * @param {string} callLogId - MongoDB CallLog ID
 * @returns {Promise<Object>} Sync result with success status
 */
async function syncCallLogToZoho(callLogId) {
  try {
    const callLog = await CallLog.findById(callLogId).populate('userId');
    
    if (!callLog) {
      throw new Error(`CallLog ${callLogId} not found`);
    }

    if (!callLog.leadId) {
      console.log(`CallLog ${callLogId} has no leadId, skipping Zoho sync`);
      return { success: false, error: 'No leadId associated with call' };
    }

    // Only sync completed or failed calls
    if (!['completed', 'busy', 'no-answer', 'failed'].includes(callLog.status)) {
      return { success: false, error: `Call status ${callLog.status} not ready for sync` };
    }

    // Prepare call data for Zoho
    const callData = {
      Call_Type: callLog.direction === 'outbound' ? 'Outbound' : 'Inbound',
      Subject: `Call to ${callLog.leadName || callLog.phoneNumber}`,
      Call_Start_Time: callLog.startTime,
      Call_Duration: callLog.duration ? `${callLog.duration} seconds` : '0 seconds',
      Call_Result: getCallResult(callLog.status),
      Description: `Twilio Call (${callLog.callSid})\nPhone: ${callLog.phoneNumber}\nStatus: ${callLog.status}${callLog.duration ? `\nDuration: ${callLog.duration}s` : ''}`,
      $se_module: 'Leads',
      Who_Id: callLog.leadId
    };

    // Create call activity in Zoho CRM
    const result = await zohoClient.createLeadCall(callLog.leadId, callData);

    if (result.success && result.data && result.data[0]) {
      const zohoActivityId = result.data[0].details.id;
      
      // Update CallLog with Zoho activity ID
      await CallLog.findByIdAndUpdate(callLogId, {
        zohoActivityId,
        syncStatus: 'synced',
        syncedAt: new Date()
      });

      console.log(`✓ CallLog ${callLogId} synced to Zoho: ${zohoActivityId}`);
      
      return {
        success: true,
        zohoActivityId,
        callLogId
      };
    } else {
      throw new Error(result.error || 'Failed to create call in Zoho');
    }
  } catch (error) {
    console.error(`Error syncing CallLog ${callLogId} to Zoho:`, error);
    
    // Update with error status
    await CallLog.findByIdAndUpdate(callLogId, {
      syncStatus: 'error',
      syncError: error.message
    });

    return {
      success: false,
      error: error.message,
      callLogId
    };
  }
}

/**
 * Sync an Activity entry to Zoho CRM as a note, call, or task
 * @param {string} activityId - MongoDB Activity ID
 * @returns {Promise<Object>} Sync result with success status
 */
async function syncActivityToZoho(activityId) {
  try {
    const activity = await Activity.findById(activityId).populate('userId');
    
    if (!activity) {
      throw new Error(`Activity ${activityId} not found`);
    }

    if (!activity.leadId) {
      console.log(`Activity ${activityId} has no leadId, skipping Zoho sync`);
      return { success: false, error: 'No leadId associated with activity' };
    }

    let result;

    // Sync based on activity type
    switch (activity.type) {
      case 'call':
        // If this activity has a linked CallLog, let syncCallLogToZoho handle it
        if (activity.metadata && activity.metadata.callLogId) {
          console.log(`Activity ${activityId} linked to CallLog, skipping direct sync`);
          return { success: true, skipped: true };
        }
        
        // Otherwise sync as a manual call note
        result = await zohoClient.createLeadNote(activity.leadId, {
          Note_Title: 'Call Activity',
          Note_Content: activity.description || 'Call logged',
          $se_module: 'Leads'
        });
        break;

      case 'note':
      case 'email':
        result = await zohoClient.createLeadNote(activity.leadId, {
          Note_Title: activity.type === 'email' ? 'Email Communication' : 'Note',
          Note_Content: activity.description || 'Activity logged',
          $se_module: 'Leads'
        });
        break;

      case 'meeting':
      case 'task':
        result = await zohoClient.createTask(activity.leadId, {
          Subject: activity.description || `${activity.type} activity`,
          Status: 'Completed',
          $se_module: 'Leads',
          What_Id: activity.leadId
        });
        break;

      default:
        // Default to note for unknown types
        result = await zohoClient.createLeadNote(activity.leadId, {
          Note_Title: 'Activity',
          Note_Content: activity.description || 'Activity logged',
          $se_module: 'Leads'
        });
    }

    if (result.success && result.data && result.data[0]) {
      const zohoActivityId = result.data[0].details.id;
      
      await Activity.findByIdAndUpdate(activityId, {
        zohoActivityId,
        syncStatus: 'synced',
        syncedAt: new Date()
      });

      console.log(`✓ Activity ${activityId} synced to Zoho: ${zohoActivityId}`);
      
      return {
        success: true,
        zohoActivityId,
        activityId
      };
    } else {
      throw new Error(result.error || 'Failed to create activity in Zoho');
    }
  } catch (error) {
    console.error(`Error syncing Activity ${activityId} to Zoho:`, error);
    
    await Activity.findByIdAndUpdate(activityId, {
      syncStatus: 'error',
      syncError: error.message
    });

    return {
      success: false,
      error: error.message,
      activityId
    };
  }
}

/**
 * Sync a SiteVisit entry to Zoho CRM as a task/event
 * @param {string} siteVisitId - MongoDB SiteVisit ID
 * @returns {Promise<Object>} Sync result with success status
 */
async function syncSiteVisitToZoho(siteVisitId) {
  try {
    const siteVisit = await SiteVisit.findById(siteVisitId).populate('agentId');
    
    if (!siteVisit) {
      throw new Error(`SiteVisit ${siteVisitId} not found`);
    }

    if (!siteVisit.leadId) {
      console.log(`SiteVisit ${siteVisitId} has no leadId, skipping Zoho sync`);
      return { success: false, error: 'No leadId associated with site visit' };
    }

    // Prepare task data for Zoho
    const taskData = {
      Subject: `Site Visit - ${siteVisit.leadName}`,
      Status: siteVisit.status === 'completed' ? 'Completed' : siteVisit.status === 'cancelled' ? 'Cancelled' : 'Not Started',
      Due_Date: siteVisit.scheduledDate,
      Description: `Site visit scheduled for ${siteVisit.leadName}\n${siteVisit.notes || ''}\nPhone: ${siteVisit.leadPhone}`,
      $se_module: 'Leads',
      What_Id: siteVisit.leadId
    };

    const result = await zohoClient.createTask(siteVisit.leadId, taskData);

    if (result.success && result.data && result.data[0]) {
      const zohoActivityId = result.data[0].details.id;
      
      await SiteVisit.findByIdAndUpdate(siteVisitId, {
        zohoActivityId,
        syncStatus: 'synced',
        syncedAt: new Date()
      });

      console.log(`✓ SiteVisit ${siteVisitId} synced to Zoho: ${zohoActivityId}`);
      
      return {
        success: true,
        zohoActivityId,
        siteVisitId
      };
    } else {
      throw new Error(result.error || 'Failed to create task in Zoho');
    }
  } catch (error) {
    console.error(`Error syncing SiteVisit ${siteVisitId} to Zoho:`, error);
    
    await SiteVisit.findByIdAndUpdate(siteVisitId, {
      syncStatus: 'error',
      syncError: error.message
    });

    return {
      success: false,
      error: error.message,
      siteVisitId
    };
  }
}

/**
 * Sync all pending entities to Zoho CRM
 * @param {string} type - Entity type: 'calls', 'activities', 'sitevisits', or 'all'
 * @param {number} limit - Maximum number of entities to sync
 * @returns {Promise<Object>} Sync results summary
 */
async function syncPendingToZoho(type = 'all', limit = 50) {
  const results = {
    calls: { success: 0, failed: 0 },
    activities: { success: 0, failed: 0 },
    siteVisits: { success: 0, failed: 0 }
  };

  try {
    // Sync CallLogs
    if (type === 'all' || type === 'calls') {
      const pendingCalls = await CallLog.find({
        syncStatus: { $in: ['ready', 'error'] },
        leadId: { $ne: null }
      }).limit(limit);

      for (const call of pendingCalls) {
        const result = await syncCallLogToZoho(call._id);
        if (result.success) {
          results.calls.success++;
        } else {
          results.calls.failed++;
        }
      }
    }

    // Sync Activities
    if (type === 'all' || type === 'activities') {
      const pendingActivities = await Activity.find({
        syncStatus: { $in: ['pending', 'error'] },
        leadId: { $ne: null },
        'metadata.callLogId': { $exists: false } // Skip activities linked to CallLogs
      }).limit(limit);

      for (const activity of pendingActivities) {
        const result = await syncActivityToZoho(activity._id);
        if (result.success) {
          results.activities.success++;
        } else {
          results.activities.failed++;
        }
      }
    }

    // Sync SiteVisits
    if (type === 'all' || type === 'sitevisits') {
      const pendingSiteVisits = await SiteVisit.find({
        syncStatus: { $in: ['pending', 'error'] },
        leadId: { $ne: null }
      }).limit(limit);

      for (const siteVisit of pendingSiteVisits) {
        const result = await syncSiteVisitToZoho(siteVisit._id);
        if (result.success) {
          results.siteVisits.success++;
        } else {
          results.siteVisits.failed++;
        }
      }
    }

    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Error in syncPendingToZoho:', error);
    return {
      success: false,
      error: error.message,
      results
    };
  }
}

/**
 * Helper function to map call status to Zoho call result
 */
function getCallResult(status) {
  const resultMap = {
    'completed': 'Connected',
    'busy': 'Busy',
    'no-answer': 'No Answer',
    'failed': 'Failed',
    'cancelled': 'Cancelled'
  };
  return resultMap[status] || 'Not Available';
}

module.exports = {
  syncCallLogToZoho,
  syncActivityToZoho,
  syncSiteVisitToZoho,
  syncPendingToZoho
};
