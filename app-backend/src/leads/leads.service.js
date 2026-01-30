/**
 * Leads Service
 * Business logic for lead management
 */

const zohoClient = require('../clients/zoho.client');
const ingestionClient = require('../clients/ingestion.client');
const { mapZohoLeadToFrontend, mapZohoNoteToActivity } = require('./zoho.mapper');
const { filterLeadsByPermission } = require('../middleware/roles');
const { NotFoundError } = require('../utils/errors');

// MongoDB Lead model
const Lead = require('../models/Lead');
const SiteVisit = require('../models/SiteVisit');
const Activity = require('../models/Activity');

// Google Sheets sync
const googleSheetsService = require('../services/googleSheets.service');

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
        status: 'Site Visit Scheduled',
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

    // Always fetch leads from Zoho CRM (single source of truth)
    // Build search criteria
    const criteria = [];

    if (status) {
        criteria.push(`(Lead_Status:equals:${status})`);
    }

    if (source) {
        // Map frontend source to Zoho source
        const zohoSource = mapFrontendSourceToZoho(source);
        criteria.push(`(Lead_Source:equals:${zohoSource})`);
    }

    if (owner) {
        criteria.push(`(Owner:equals:${owner})`);
    }

    // Fetch from Zoho
    let zohoResponse;
    if (criteria.length > 0) {
        const criteriaString = criteria.join('and');
        zohoResponse = await zohoClient.searchLeads(criteriaString, page, limit);
    } else {
        zohoResponse = await zohoClient.getLeads(page, limit);
    }

    // Map leads
    let leads = (zohoResponse.data || []).map(mapZohoLeadToFrontend);

    // Merge propertyId and assignedTo from MongoDB if available
    if (useDatabase() && leads.length > 0) {
        try {
            const zohoIds = leads.map(l => l.id);
            const mongoLeads = await Lead.find({ zohoId: { $in: zohoIds } }).lean();
            const mongoLeadMap = new Map(mongoLeads.map(l => [l.zohoId, l]));

            leads = leads.map(lead => {
                const mongoLead = mongoLeadMap.get(lead.id);
                if (mongoLead) {
                    const updates = {};
                    if (mongoLead.propertyId) {
                        updates.propertyId = mongoLead.propertyId.toString();
                    }
                    if (mongoLead.assignedTo) {
                        updates.assignedTo = mongoLead.assignedTo.toString();
                        updates.assignedToName = mongoLead.assignedToName || null;
                    }
                    // Merge status from MongoDB if it exists (overrides Zoho status)
                    if (mongoLead.status) {
                        updates.status = mongoLead.status;
                    }
                    if (mongoLead.notes) {
                        updates.notes = mongoLead.notes;
                    }
                    if (Object.keys(updates).length > 0) {
                        return { ...lead, ...updates };
                    }
                }
                return lead;
            });
        } catch (dbError) {
            console.error('Failed to fetch lead data from MongoDB:', dbError);
            // Continue without MongoDB data
        }
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

        const { canAccessLead } = require('../middleware/roles');
        if (!canAccessLead(user, lead)) {
            throw new NotFoundError('Lead not found');
        }

        return { ...lead, activities: [] };
    }

    // Always fetch lead from Zoho CRM (single source of truth)
    // Fetch lead from Zoho
    const zohoResponse = await zohoClient.getLead(leadId);

    if (!zohoResponse.data || zohoResponse.data.length === 0) {
        throw new NotFoundError('Lead not found');
    }

    const lead = mapZohoLeadToFrontend(zohoResponse.data[0]);

    // Check permissions
    const { canAccessLead } = require('../middleware/roles');
    if (!canAccessLead(user, lead)) {
        throw new NotFoundError('Lead not found');
    }

    // Fetch activities/notes
    try {
        const notesResponse = await zohoClient.getLeadNotes(leadId);
        lead.activities = (notesResponse.data || [])
            .map(mapZohoNoteToActivity)
    } catch (error) {
        // Notes might fail, that's okay
        lead.activities = [];
    }

    // Merge notes from MongoDB (ElevenLabs summary)
    if (useDatabase()) {
        const Lead = require('../models/Lead');
        const mongoLead = await Lead.findOne({ zohoId: leadId });
        if (mongoLead && mongoLead.notes) {
            lead.notes = mongoLead.notes;
        }
    }

    return lead;
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
            // Continue without auto-assignment
        }
    }

    // Try to create in Zoho CRM via ingestion service, but fallback to local DB only
    let zohoResult = null;
    let useLocalOnly = false;
    
    try {
        zohoResult = await ingestionClient.createLead(leadData);
    } catch (ingestionError) {
        console.warn('⚠️  Ingestion service unavailable, using local database only:', ingestionError.message);
        useLocalOnly = true;
        // Generate a local ID if ingestion fails
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

            // Add propertyId if provided
            if (leadData.propertyId) {
                mongoData.propertyId = leadData.propertyId;
            }

            // Add auto-assignment if agent found
            if (assignedAgentId) {
                mongoData.assignedTo = assignedAgentId;
                mongoData.assignedToName = assignedAgentName;
                mongoData.assignedAt = new Date();
                mongoData.assignedBy = 'auto'; // Mark as auto-assigned
            }

            // Find or update the lead in MongoDB by zohoId
            await Lead.findOneAndUpdate(
                { zohoId: zohoResult.leadId },
                mongoData,
                { upsert: true, new: true }
            );

            if (assignedAgentId) {
                console.log(`Lead ${zohoResult.leadId} auto-assigned to ${assignedAgentName}`);
            }

            // Trigger automation workflows for new lead
            try {
                const workflowEngine = require('../services/workflow.engine');
                const savedLead = await Lead.findOne({ zohoId: zohoResult.leadId });
                if (savedLead) {
                    // Trigger asynchronously to not block the response
                    workflowEngine.triggerNewLead(savedLead).catch(err => {
                        console.error('Error triggering new lead automations:', err);
                    });
                }
            } catch (automationError) {
                console.error('Failed to trigger automations:', automationError);
                // Don't fail the request - lead creation succeeded
            }
        } catch (dbError) {
            console.error('Failed to save lead data to MongoDB:', dbError);
            // Don't fail the request - Zoho creation succeeded
        }
    }

    // Add assignment info to response
    if (assignedAgentId) {
        zohoResult.assignedTo = assignedAgentId.toString();
        zohoResult.assignedToName = assignedAgentName;
        zohoResult.autoAssigned = true;
    }

    return zohoResult;
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
 * Update lead
 */
async function updateLead(user, leadId, updateData) {
    // Demo mode - update in memory (won't persist)
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
        throw new ExternalServiceError('Zoho CRM', new Error(result.error));
    }

    // Fetch updated lead to return
    return await getLead(user, leadId);
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

/**
 * Confirm site visit
 */
async function confirmSiteVisit(leadId, scheduledAt, userId, propertyId = null) {
    // Import availability service for conflict checking
    const availabilityService = require('../services/availability.service');
    
    // Parse scheduledAt to get date and time
    const scheduledDate = new Date(scheduledAt);
    const dateStr = scheduledDate.toISOString().split('T')[0];
    const hours = scheduledDate.getHours().toString().padStart(2, '0');
    const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
    const startTime = `${hours}:${minutes}`;
    
    // Check for conflicts if propertyId is provided
    if (propertyId) {
        const conflicts = await availabilityService.checkConflicts(propertyId, userId, dateStr, startTime);
        
        if (conflicts.hasConflict) {
            const messages = [];
            if (conflicts.propertyConflict) {
                messages.push(conflicts.propertyConflict.message);
            }
            if (conflicts.agentConflict) {
                messages.push(conflicts.agentConflict.message);
            }
            const error = new Error(messages.join('. '));
            error.statusCode = 409; // Conflict
            error.conflicts = conflicts;
            throw error;
        }
        
        // Also check if the slot is available according to property settings
        const slotCheck = await availabilityService.checkSlotAvailability(propertyId, dateStr, startTime);
        if (!slotCheck.available) {
            const error = new Error(slotCheck.reason || 'Selected time slot is not available');
            error.statusCode = 400;
            throw error;
        }
    }
    
    // Fetch lead from Zoho to get details (pass a dummy user for now)
    // In production, this should receive the user object
    const lead = await zohoClient.getLead(leadId);
    const zohoLead = lead.data && lead.data[0];

    // Always update the lead status in MongoDB when confirming a site visit
    if (useDatabase()) {
        try {
            const updateData = {
                zohoId: leadId,
                name: zohoLead?.Full_Name || zohoLead?.Last_Name || 'Unknown',
                phone: zohoLead?.Phone || zohoLead?.Mobile || '',
                status: 'Site Visit Scheduled'
            };

            // Add propertyId if provided
            if (propertyId) {
                updateData.propertyId = propertyId;
            }

            await Lead.findOneAndUpdate(
                { zohoId: leadId },
                updateData,
                { upsert: true, new: true }
            );
            console.log(`Updated lead ${leadId} with status 'Site Visit Scheduled'${propertyId ? ` and propertyId ${propertyId}` : ''}`);
        } catch (dbError) {
            console.error('Failed to update lead status:', dbError);
        }
    }

    // Create a new site visit with updated schema
    const visit = await SiteVisit.create({
        leadId: leadId,
        leadName: zohoLead?.Full_Name || zohoLead?.Last_Name || 'Unknown',
        leadPhone: zohoLead?.Phone || zohoLead?.Mobile || '',
        scheduledAt,
        agentId: userId,
        propertyId: propertyId,
        status: 'scheduled',
        syncStatus: 'pending'
    });

    // Sync site visit to Google Sheets (non-blocking)
    try {
        const populatedVisit = await SiteVisit.findById(visit._id)
            .populate('propertyId', 'name location')
            .populate('agentId', 'name');
        googleSheetsService.syncSiteVisit(populatedVisit).catch(err => {
            console.error('[GoogleSheets] Site visit sync error:', err.message);
        });
    } catch (err) {
        console.error('[GoogleSheets] Site visit sync error:', err.message);
    }

    return visit;
}

/**
 * Get site visits for today
 */
async function getSiteVisitsForToday(userId) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // Use agentId instead of confirmedBy
    const visits = await SiteVisit.find({
        agentId: userId,
        scheduledAt: { $gte: start, $lte: end }
    }).populate('agentId', 'name email');

    // Map visits to include lead data from Zoho if needed
    return visits;
}

/**
 * Create activity
 */
async function createActivity(activityData) {
    return Activity.create(activityData);
}

/**
 * Get recent activities (all users)
 */
async function getRecentActivities(limit = 50) {
    return Activity.getRecent(limit);
}

/**
 * Get activities by user ID (for agent's own activities)
 */
async function getActivitiesByUser(userId, limit = 50) {
    return Activity.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

/**
 * Get all activities (for owner/admin/manager)
 */
async function getAllActivities(limit = 100) {
    return Activity.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

/**
 * Get call logs by user ID (for agent's own calls)
 */
async function getCallLogsByUser(userId, limit = 50) {
    const CallLog = require('../models/CallLog');
    return CallLog.find({ agentId: userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get all call logs (for owner/admin/manager)
 */
async function getAllCallLogs(limit = 100) {
    const CallLog = require('../models/CallLog');
    return CallLog.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get site visits by user ID (for agent's own visits)
 */
async function getSiteVisitsByUser(userId, limit = 50) {
    return SiteVisit.find({ agentId: userId })
        .sort({ scheduledAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get all site visits (for owner/admin/manager)
 */
async function getAllSiteVisits(limit = 100) {
    return SiteVisit.find()
        .sort({ scheduledAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get tasks/reminders for a user
 */
async function getTasks(userId, { status, priority } = {}) {
    const query = { userId, type: 'task' };

    if (status === 'completed') {
        query.isCompleted = true;
    } else if (status === 'pending') {
        query.isCompleted = false;
    }

    if (priority) {
        query['metadata.priority'] = priority;
    }

    return Activity.find(query)
        .sort({ scheduledAt: 1, createdAt: -1 })
        .limit(100);
}

/**
 * Create a new task
 */
async function createTask(taskData) {
    const { userId, userName, title, description, scheduledAt, priority, leadId } = taskData;

    const task = new Activity({
        leadId: leadId || 'general',
        type: 'task',
        title,
        description,
        userId,
        userName,
        scheduledAt: scheduledAt || new Date(),
        isCompleted: false,
        metadata: {
            priority: priority || 'medium'
        }
    });

    return task.save();
}

/**
 * Update a task
 */
async function updateTask(taskId, userId, updates) {
    const task = await Activity.findOne({ _id: taskId, userId, type: 'task' });

    if (!task) {
        throw new NotFoundError('Task not found or access denied');
    }

    if (updates.isCompleted !== undefined) {
        task.isCompleted = updates.isCompleted;
        if (updates.isCompleted) {
            task.completedAt = new Date();
        }
    }

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;
    if (updates.scheduledAt) task.scheduledAt = updates.scheduledAt;

    if (updates.priority) {
        task.metadata = task.metadata || {};
        task.metadata.priority = updates.priority;
    }

    return task.save();
}

/**
 * Delete a task
 */
async function deleteTask(taskId, userId) {
    const result = await Activity.deleteOne({ _id: taskId, userId, type: 'task' });

    if (result.deletedCount === 0) {
        throw new NotFoundError('Task not found or access denied');
    }

    return result;
}

/**
 * Get all users from MongoDB
 */
async function getUsers() {
    const User = require('../models/User');
    return User.find()
        .select('name email role createdAt')
        .sort({ name: 1 });
}

/**
 * Get leads by owner ID
 */
async function getLeadsByOwner(ownerId) {
    try {
        // Fetch all leads from Zoho and filter by owner
        const zohoResponse = await zohoClient.getLeads(1, 200); // Get more leads
        const allLeads = (zohoResponse.data || []).map(mapZohoLeadToFrontend);

        // Filter by owner
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
 * Assign lead to agent - updates both Zoho and MongoDB
 */
async function assignLeadToAgent(leadId, agentId, assignedBy) {
    try {
        // Get agent details
        const User = require('../models/User');
        const agent = await User.findById(agentId);
        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        // Update in MongoDB with assignment info
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

        // Optionally update in Zoho as well (if Owner field mapping is available)
        // For now, we just store in MongoDB

        return { success: true, leadId, assignedTo: agentId, agentName: agent.name || agent.email };
    } catch (error) {
        console.error('Assign lead to agent error:', error);
        throw error;
    }
}

/**
 * Sync all site visits to Google Sheets
 */
async function syncAllSiteVisitsToGoogleSheets() {
    try {
        const visits = await SiteVisit.find({ status: { $in: ['scheduled', 'completed'] } })
            .populate('propertyId', 'name location')
            .populate('agentId', 'name')
            .sort({ scheduledAt: -1 });
        
        const result = await googleSheetsService.syncAllSiteVisits(visits);
        return {
            success: true,
            message: `Synced ${visits.length} site visits to Google Sheets`,
            result
        };
    } catch (error) {
        console.error('Sync all site visits to Google Sheets error:', error);
        throw error;
    }
}

module.exports = {
    getLeads,
    getLead,
    getLeadById,
    getLeadsByOwner,
    createLead,
    updateLead,
    assignLeadToAgent,
    confirmSiteVisit,
    getSiteVisitsForToday,
    createActivity,
    getRecentActivities,
    getActivitiesByUser,
    getAllActivities,
    getCallLogsByUser,
    getAllCallLogs,
    getSiteVisitsByUser,
    getAllSiteVisits,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    getUsers,
    syncAllSiteVisitsToGoogleSheets
};
