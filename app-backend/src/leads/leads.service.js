/**
 * Leads Service (Refactored)
 * Core lead management only - activities, tasks, appointments (site visits), call logs
 * are now in their own focused services.
 * 
 * This file re-exports from child services for backward compatibility.
 */

const zohoClient = require('../clients/zoho.client');
const ingestionClient = require('../clients/ingestion.client');
const { mapZohoLeadToFrontend, mapZohoNoteToActivity } = require('./zoho.mapper');
const { filterLeadsByPermission, canAccessLead } = require('../middleware/roles');
const { NotFoundError } = require('../utils/errors');

// MongoDB Lead model
const Lead = require('../models/Lead');

// Workflow Engine for automation triggers
const workflowEngine = require('../services/workflow.engine');

// Data Layer for proper data source management
const dataLayer = require('./lead.dataLayer');

// AWS Email Service for notifications
const awsEmailService = require('../services/awsEmail.service');

// Check if MongoDB is available
const useDatabase = () => !!process.env.MONGODB_URI;

// Demo mode flag - only enabled when explicitly set
const isDemoMode = process.env.DEMO_MODE === 'true';

// Mock data for demo mode
const mockLeads = [
    {
        id: 'lead_001',
        name: 'John Smith',
        email: 'john.smith@example.com',
        phone: '+1 555-0101',
        company: 'Acme Corp',
        source: 'Website',
        status: 'New',
        score: 85,
        assignedTo: 'user_002',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activities: []
    },
    {
        id: 'lead_002',
        name: 'Sarah Johnson',
        email: 'sarah.j@techstart.io',
        phone: '+1 555-0102',
        company: 'TechStart Inc',
        source: 'LinkedIn Ads',
        status: 'Follow-up Completed',
        score: 72,
        assignedTo: 'user_002',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        activities: []
    },
    {
        id: 'lead_003',
        name: 'Michael Chen',
        email: 'mchen@globaltech.com',
        phone: '+1 555-0103',
        company: 'Global Tech',
        source: 'Google Ads',
        status: 'Appointment Scheduled',
        score: 91,
        assignedTo: 'user_003',
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date().toISOString(),
        activities: []
    },
    {
        id: 'lead_004',
        name: 'Emily Davis',
        email: 'emily.d@innovate.co',
        phone: '+1 555-0104',
        company: 'Innovate Co',
        source: 'Referral',
        status: 'Interested',
        score: 88,
        assignedTo: 'user_002',
        createdAt: new Date(Date.now() - 259200000).toISOString(),
        updatedAt: new Date().toISOString(),
        activities: []
    },
    {
        id: 'lead_005',
        name: 'Raj Patel',
        email: 'raj@startuplab.in',
        phone: '+91 98765 43210',
        company: 'StartupLab',
        source: 'Facebook',
        status: 'New',
        score: 65,
        assignedTo: 'user_002',
        createdAt: new Date(Date.now() - 345600000).toISOString(),
        updatedAt: new Date().toISOString(),
        activities: []
    }
];

/**
 * Get all leads with pagination and filters
 */
async function getLeads(user, { page = 1, limit = 20, status, source, owner }) {
    // Use mock data in demo mode
    if (isDemoMode) {
        let filteredLeads = [...mockLeads];

        if (status) {
            filteredLeads = filteredLeads.filter(l => l.status === status);
        }
        if (source) {
            filteredLeads = filteredLeads.filter(l => l.source === source);
        }
        if (owner) {
            filteredLeads = filteredLeads.filter(l => l.assignedTo === owner);
        }

        // Apply permission filtering
        filteredLeads = filterLeadsByPermission(user, filteredLeads);

        const start = (page - 1) * limit;
        const paginatedLeads = filteredLeads.slice(start, start + limit);

        return {
            data: paginatedLeads,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total: filteredLeads.length,
                totalPages: Math.ceil(filteredLeads.length / limit)
            }
        };
    }

    // ALWAYS use MongoDB as primary source for leads
    // This ensures local-only leads (created when Zoho is unavailable) are always visible
    if (useDatabase()) {
        try {
            const query = {};
            if (status) query.status = status;
            if (source) query.source = source;
            if (owner) query.assignedTo = owner;
            
            const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
            const mongoLeads = await Lead.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean();
            
            const total = await Lead.countDocuments(query);
            
            // Map MongoDB leads to frontend format
            const leads = mongoLeads.map(lead => ({
                id: lead.zohoId || lead._id.toString(),
                ...lead,
                _id: undefined
            }));
            
            // Apply permission filtering
            const filteredLeads = filterLeadsByPermission(user, leads);
            
            return {
                data: filteredLeads,
                pagination: {
                    page: parseInt(page, 10),
                    limit: parseInt(limit, 10),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit, 10))
                },
                source: 'mongodb'
            };
        } catch (dbError) {
            console.error('MongoDB query failed:', dbError);
            // Fall through to Zoho
        }
    }

    // Fallback to Zoho if MongoDB fails
    // Build search criteria
    const criteria = [];

    if (status) {
        criteria.push(`(Lead_Status:equals:${status})`);
    }

    if (source) {
        const zohoSource = mapFrontendSourceToZoho(source);
        criteria.push(`(Lead_Source:equals:${zohoSource})`);
    }

    if (owner) {
        criteria.push(`(Owner:equals:${owner})`);
    }

    let leads = [];
    let zohoResponse = null;

    try {
        // Fetch from Zoho
        if (criteria.length > 0) {
            const criteriaString = criteria.join('and');
            zohoResponse = await zohoClient.searchLeads(criteriaString, page, limit);
        } else {
            zohoResponse = await zohoClient.getLeads(page, limit);
        }
        
        // Map leads from Zoho
        leads = (zohoResponse.data || []).map(mapZohoLeadToFrontend);
    } catch (zohoError) {
        console.warn('Zoho API also unavailable:', zohoError.message);
        return {
            data: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            error: 'Unable to fetch leads from any source'
        };
    }

    // Apply permission filtering
    const filteredLeads = filterLeadsByPermission(user, leads);

    // Build pagination info
    const pagination = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: zohoResponse.info?.count || filteredLeads.length,
        totalPages: Math.ceil((zohoResponse.info?.count || filteredLeads.length) / limit)
    };

    return {
        data: filteredLeads,
        pagination
    };
}

/**
 * Get single lead by ID
 */
async function getLead(user, leadId) {
    // Use mock data in demo mode
    if (isDemoMode) {
        const lead = mockLeads.find(l => l.id === leadId);
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        if (!canAccessLead(user, lead)) {
            throw new NotFoundError('Lead not found');
        }

        return { ...lead, activities: [] };
    }

    // Fetch lead from Zoho
    const zohoResponse = await zohoClient.getLead(leadId);

    if (!zohoResponse.data || zohoResponse.data.length === 0) {
        throw new NotFoundError('Lead not found');
    }

    const lead = mapZohoLeadToFrontend(zohoResponse.data[0]);

    // Check permissions
    if (!canAccessLead(user, lead)) {
        throw new NotFoundError('Lead not found');
    }

    // Fetch activities/notes
    try {
        const notesResponse = await zohoClient.getLeadNotes(leadId);
        lead.activities = (notesResponse.data || []).map(mapZohoNoteToActivity);
    } catch (error) {
        lead.activities = [];
    }

    // Merge local-only fields from MongoDB (notes, propertyId, etc.)
    // Status comes from Zoho - MongoDB is NOT source of truth for status
    if (useDatabase()) {
        const mergedLead = await dataLayer.mergeWithLocalData(lead);
        return mergedLead;
    }

    return lead;
}

/**
 * Get lead by ID (without user permission check)
 */
async function getLeadById(leadId) {
    try {
        const zohoResponse = await zohoClient.getLead(leadId);
        if (!zohoResponse || !zohoResponse.data || zohoResponse.data.length === 0) {
            throw new NotFoundError('Lead not found');
        }
        return mapZohoLeadToFrontend(zohoResponse.data[0]);
    } catch (error) {
        console.error('Get lead by ID error:', error);
        throw error;
    }
}

/**
 * Get leads by owner ID
 */
async function getLeadsByOwner(ownerId) {
    try {
        const zohoResponse = await zohoClient.getLeads(1, 200);
        const allLeads = (zohoResponse.data || []).map(mapZohoLeadToFrontend);

        const ownerLeads = allLeads.filter(lead => {
            const leadOwner = typeof lead.owner === 'string' ? lead.owner : lead.owner?.id;
            return leadOwner === ownerId;
        });

        return ownerLeads;
    } catch (error) {
        console.error('Get leads by owner error:', error);
        return [];
    }
}

/**
 * Create lead (proxy to ingestion service)
 */
async function createLead(leadData) {
    // Use mock data in demo mode
    if (isDemoMode) {
        const newLead = {
            id: `lead_${Date.now()}`,
            name: leadData.name,
            email: leadData.email,
            phone: leadData.phone,
            company: leadData.company || '',
            source: leadData.source || 'Website',
            status: 'New',
            score: Math.floor(Math.random() * 40) + 60,
            assignedTo: 'user_002',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            activities: [],
            propertyId: leadData.propertyId || null
        };
        mockLeads.unshift(newLead);
        return { success: true, lead: newLead };
    }

    // Auto-assign lead to property's agent if property is specified
    let assignedAgentId = null;
    let assignedAgentName = null;

    if (useDatabase() && leadData.propertyId) {
        try {
            const Property = require('../properties/properties.model');
            const property = await Property.findById(leadData.propertyId)
                .populate('assignedAgent', 'name email');

            if (property && property.assignedAgent) {
                assignedAgentId = property.assignedAgent._id;
                assignedAgentName = property.assignedAgent.name || property.assignedAgent.email;
                console.log(`Auto-assigning lead to agent ${assignedAgentName} based on property ${property.name}`);
            }
        } catch (error) {
            console.error('Failed to fetch property for auto-assignment:', error);
        }
    }

    // Try to create in Zoho CRM via ingestion service
    let zohoResult = null;
    let useLocalOnly = false;
    
    try {
        zohoResult = await ingestionClient.createLead(leadData);
    } catch (ingestionError) {
        console.warn('⚠️  Ingestion service unavailable, using local database only:', ingestionError.message);
        useLocalOnly = true;
        zohoResult = {
            success: true,
            leadId: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message: 'Lead created locally (ingestion service unavailable)'
        };
    }

    // Also save to MongoDB with propertyId and auto-assignment if provided
    if (useDatabase()) {
        try {
            const mongoData = {
                zohoId: zohoResult.leadId,
                name: leadData.name,
                email: leadData.email,
                phone: leadData.phone,
                company: leadData.company,
                source: leadData.source,
                status: 'New'
            };

            if (leadData.propertyId) {
                mongoData.propertyId = leadData.propertyId;
            }

            if (assignedAgentId) {
                mongoData.assignedTo = assignedAgentId;
                mongoData.assignedToName = assignedAgentName;
                mongoData.assignedAt = new Date();
                mongoData.assignedBy = 'auto';
            }

            await Lead.findOneAndUpdate(
                { zohoId: zohoResult.leadId },
                mongoData,
                { upsert: true, new: true }
            );

            if (assignedAgentId) {
                console.log(`Lead ${zohoResult.leadId} auto-assigned to ${assignedAgentName}`);
            }

            // Trigger automation workflows for new lead
            console.log(`🤖 Attempting to trigger automations for lead: ${zohoResult.leadId}`);
            try {
                const savedLead = await Lead.findOne({ zohoId: zohoResult.leadId });
                console.log(`🤖 Found saved lead:`, savedLead ? savedLead._id : 'NOT FOUND');
                if (savedLead) {
                    console.log(`🤖 Calling workflowEngine.triggerNewLead...`);
                    workflowEngine.triggerNewLead(savedLead).then(result => {
                        console.log(`🤖 Automation trigger result:`, result);
                    }).catch(err => {
                        console.error('❌ Error triggering new lead automations:', err);
                    });
                }
            } catch (automationError) {
                console.error('❌ Failed to trigger automations:', automationError);
            }

            // Send AWS email notification for new lead (non-blocking)
            if (awsEmailService.isConfigured()) {
                try {
                    awsEmailService.sendNewLeadEmail({
                        leadName: leadData.name,
                        leadEmail: leadData.email,
                        leadPhone: leadData.phone,
                        leadSource: leadData.source || 'Website',
                        leadId: zohoResult.leadId,
                        assignedAgent: assignedAgentName || 'Unassigned',
                        propertyName: leadData.propertyName || null
                    }).then(result => {
                        console.log('[AWSEmail] New lead notification sent:', result?.messageId);
                    }).catch(err => {
                        console.error('[AWSEmail] New lead email failed:', err.message);
                    });
                } catch (emailError) {
                    console.error('[AWSEmail] New lead email error:', emailError.message);
                }
            }
        } catch (dbError) {
            console.error('Failed to save lead data to MongoDB:', dbError);
        }
    }

    if (assignedAgentId) {
        zohoResult.assignedTo = assignedAgentId.toString();
        zohoResult.assignedToName = assignedAgentName;
        zohoResult.autoAssigned = true;
    }

    return zohoResult;
}

/**
 * Update lead
 */
async function updateLead(user, leadId, updateData) {
    // Demo mode - update in memory
    if (isDemoMode) {
        const index = mockLeads.findIndex(l => l.id === leadId);
        if (index === -1) {
            throw new NotFoundError('Lead not found');
        }
        mockLeads[index] = { ...mockLeads[index], ...updateData, updatedAt: new Date().toISOString() };
        return mockLeads[index];
    }

    // Update lead in Zoho CRM
    const zohoUpdateData = mapFrontendToZohoFields(updateData);
    const result = await zohoClient.updateLead(leadId, zohoUpdateData);

    if (!result.success) {
        const { ExternalServiceError } = require('../utils/errors');
        throw new ExternalServiceError('Zoho CRM', new Error(result.error));
    }

    // Fetch updated lead to return
    const updatedLead = await getLead(user, leadId);

    // Trigger automation workflows for lead update
    try {
        if (useDatabase()) {
            const mongoLead = await Lead.findOne({ zohoId: leadId });
            if (mongoLead) {
                workflowEngine.triggerLeadUpdated(mongoLead, updateData).catch(err => {
                    console.error('Error triggering lead updated automations:', err);
                });
                
                // Check for task auto-completion on status change
                if (updateData.status) {
                    const { taskService } = require('../tasks');
                    taskService.checkAutoCompleteForStatusChange(mongoLead._id, updateData.status)
                        .then(count => {
                            if (count > 0) {
                                console.log(`✅ Auto-completed ${count} task(s) from status change: ${updateData.status}`);
                            }
                        })
                        .catch(err => console.error('Task auto-complete failed:', err.message));
                }
            }
        }
    } catch (automationError) {
        console.error('Failed to trigger lead update automations:', automationError);
    }

    return updatedLead;
}

/**
 * Delete lead - removes from both Zoho and MongoDB
 */
async function deleteLead(user, leadId) {
    // Demo mode - remove from memory
    if (isDemoMode) {
        const index = mockLeads.findIndex(l => l.id === leadId);
        if (index === -1) {
            throw new NotFoundError('Lead not found');
        }
        mockLeads.splice(index, 1);
        return { success: true, message: 'Lead deleted successfully' };
    }

    // First, try to delete from Zoho CRM
    let zohoDeleted = false;
    try {
        const result = await zohoClient.deleteLead(leadId);
        zohoDeleted = result.success;
        if (!result.success) {
            console.warn('Zoho delete failed:', result.error);
        }
    } catch (zohoError) {
        console.warn('Zoho API unavailable for delete, will remove from MongoDB:', zohoError.message);
    }

    // Also delete from MongoDB
    if (useDatabase()) {
        try {
            // Delete lead record
            await Lead.deleteOne({ $or: [{ zohoId: leadId }, { _id: leadId }, { zohoLeadId: leadId }] });
            
            // Also delete related site visits
            const SiteVisit = require('../models/SiteVisit');
            await SiteVisit.deleteMany({ leadId: leadId });
            
            // Delete related activities
            const Activity = require('../models/Activity');
            await Activity.deleteMany({ leadId: leadId });
            
            console.log(`Lead ${leadId} and related data deleted from MongoDB`);
        } catch (dbError) {
            console.error('Failed to delete lead from MongoDB:', dbError);
        }
    }

    return { 
        success: true, 
        message: zohoDeleted ? 'Lead deleted from Zoho and MongoDB' : 'Lead deleted from MongoDB (Zoho unavailable)',
        zohoDeleted 
    };
}

/**
 * Bulk delete leads - removes multiple leads from both Zoho and MongoDB
 */
async function deleteLeads(user, leadIds) {
    const results = [];
    for (const leadId of leadIds) {
        try {
            const result = await deleteLead(user, leadId);
            results.push({ leadId, ...result });
        } catch (error) {
            results.push({ leadId, success: false, error: error.message });
        }
    }
    return {
        success: results.every(r => r.success),
        results,
        deletedCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length
    };
}

/**
 * Assign lead to agent - updates both Zoho and MongoDB
 */
async function assignLeadToAgent(leadId, agentId, assignedBy) {
    try {
        const User = require('../models/User');
        const agent = await User.findById(agentId);
        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        if (useDatabase()) {
            await Lead.findOneAndUpdate(
                { zohoId: leadId },
                {
                    zohoId: leadId,
                    assignedTo: agentId,
                    assignedToName: agent.name || agent.email,
                    assignedAt: new Date(),
                    assignedBy: assignedBy
                },
                { upsert: true, new: true }
            );
            console.log(`Lead ${leadId} assigned to agent ${agent.name || agent.email} (${agentId})`);
        }

        return { success: true, leadId, assignedTo: agentId, agentName: agent.name || agent.email };
    } catch (error) {
        console.error('Assign lead to agent error:', error);
        throw error;
    }
}

/**
 * Helper: Map frontend source to Zoho
 */
function mapFrontendSourceToZoho(source) {
    const map = {
        'Facebook': 'Facebook',
        'Website': 'Website',
        'Google Ads': 'Google AdWords',
        'LinkedIn Ads': 'LinkedIn',
        'Referral': 'Employee Referral',
        'WhatsApp': 'WhatsApp'
    };
    return map[source] || source;
}

/**
 * Map frontend field names to Zoho CRM field names
 */
function mapFrontendToZohoFields(data) {
    const mapping = {
        name: 'Last_Name',
        email: 'Email',
        phone: 'Phone',
        company: 'Company',
        source: 'Lead_Source',
        status: 'Lead_Status'
    };

    const zohoData = {};
    for (const [key, value] of Object.entries(data)) {
        if (mapping[key]) {
            zohoData[mapping[key]] = value;
        }
    }
    return zohoData;
}

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// Import from child services and re-export
// ============================================================================

const activityService = require('./activity.service');
const taskService = require('./task.service');
const siteVisitService = require('./siteVisit.service');
const callLogService = require('./callLog.service');

module.exports = {
    // Lead operations (this file)
    getLeads,
    getLead,
    getLeadById,
    getLeadsByOwner,
    createLead,
    updateLead,
    deleteLead,
    deleteLeads,
    assignLeadToAgent,
    
    // Activity operations (re-exported from activity.service.js)
    createActivity: activityService.createActivity,
    getRecentActivities: activityService.getRecentActivities,
    getActivitiesByUser: activityService.getActivitiesByUser,
    getAllActivities: activityService.getAllActivities,
    
    // Task operations (re-exported from task.service.js)
    getTasks: taskService.getTasks,
    createTask: taskService.createTask,
    updateTask: taskService.updateTask,
    deleteTask: taskService.deleteTask,
    
    // Appointment operations (re-exported from siteVisit.service.js)
    // Generic names
    confirmAppointment: siteVisitService.confirmSiteVisit,
    getAppointmentsForToday: siteVisitService.getSiteVisitsForToday,
    getAppointmentsByUser: siteVisitService.getSiteVisitsByUser,
    getAllAppointments: siteVisitService.getAllSiteVisits,
    syncAllAppointmentsToGoogleSheets: siteVisitService.syncAllSiteVisitsToGoogleSheets,
    // Backward-compat aliases
    confirmSiteVisit: siteVisitService.confirmSiteVisit,
    getSiteVisitsForToday: siteVisitService.getSiteVisitsForToday,
    getSiteVisitsByUser: siteVisitService.getSiteVisitsByUser,
    getAllSiteVisits: siteVisitService.getAllSiteVisits,
    syncAllSiteVisitsToGoogleSheets: siteVisitService.syncAllSiteVisitsToGoogleSheets,
    
    // Call log operations (re-exported from callLog.service.js)
    getCallLogsByUser: callLogService.getCallLogsByUser,
    getAllCallLogs: callLogService.getAllCallLogs,
    
    // User operations (moved to users/user.service.js but re-exported for compatibility)
    getUsers: require('../users/user.service').getUsers
};
