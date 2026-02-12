/**
 * Workflow Triggers
 * Handles trigger matching and condition evaluation for automations
 */

const Automation = require('../models/Automation');

/**
 * Check if a lead matches the automation's trigger conditions
 */
function matchesTriggerConditions(lead, conditions) {
    if (!conditions) return true;

    // Check lead source
    if (conditions.leadSource?.length > 0) {
        if (!conditions.leadSource.includes(lead.source)) {
            return false;
        }
    }

    // Check budget range
    if (conditions.minBudget && lead.budget < conditions.minBudget) {
        return false;
    }
    if (conditions.maxBudget && lead.budget > conditions.maxBudget) {
        return false;
    }

    // Check categories (supports both new 'categories' and legacy 'propertyTypes')
    const categoryFilter = conditions.categories?.length > 0 ? conditions.categories : conditions.propertyTypes;
    if (categoryFilter?.length > 0) {
        const leadCategory = lead.category || lead.propertyType;
        if (!categoryFilter.includes(leadCategory)) {
            return false;
        }
    }

    // Check locations
    if (conditions.locations?.length > 0) {
        const leadLocation = lead.location?.toLowerCase() || '';
        const matchesLocation = conditions.locations.some(loc => 
            leadLocation.includes(loc.toLowerCase())
        );
        if (!matchesLocation) {
            return false;
        }
    }

    return true;
}

/**
 * Find automations matching a trigger type
 */
async function findMatchingAutomations(triggerType, lead, additionalFilter = {}) {
    const automations = await Automation.find({
        triggerType,
        isActive: true,
        ...additionalFilter
    });

    return automations.filter(automation => 
        matchesTriggerConditions(lead, automation.triggerConditions)
    );
}

/**
 * Trigger automations for a new lead
 */
async function triggerNewLead(lead, startAutomationFn) {
    try {
        console.log(`🔔 Triggering automations for new lead: ${lead.name}`);
        
        const automations = await findMatchingAutomations('newLead', lead);
        console.log(`Found ${automations.length} active automations for newLead trigger`);

        const results = [];
        for (const automation of automations) {
            const result = await startAutomationFn(automation, lead);
            results.push({ automationId: automation._id, result });
        }
        
        return results;
    } catch (error) {
        console.error('Error triggering new lead automations:', error);
        throw error;
    }
}

/**
 * Trigger automations for lead update
 */
async function triggerLeadUpdated(lead, changes, startAutomationFn) {
    try {
        const automations = await findMatchingAutomations('leadUpdated', lead);

        const results = [];
        for (const automation of automations) {
            const result = await startAutomationFn(automation, lead, { changes });
            results.push({ automationId: automation._id, result });
        }
        
        return results;
    } catch (error) {
        console.error('Error triggering lead updated automations:', error);
        throw error;
    }
}

/**
 * Trigger automations for appointment scheduled (was: site visit scheduled)
 * Matches both 'appointmentScheduled' and legacy 'siteVisitScheduled' triggers.
 */
async function triggerAppointmentScheduled(lead, appointment, startAutomationFn) {
    try {
        // Match both new and legacy trigger types
        const automationsNew = await findMatchingAutomations('appointmentScheduled', lead);
        const automationsLegacy = await findMatchingAutomations('siteVisitScheduled', lead);
        const automations = [...automationsNew, ...automationsLegacy];
        // Deduplicate by _id
        const seen = new Set();
        const unique = automations.filter(a => {
            const id = a._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        const results = [];
        for (const automation of unique) {
            const result = await startAutomationFn(automation, lead, { appointment, siteVisit: appointment });
            results.push({ automationId: automation._id, result });
        }
        
        return results;
    } catch (error) {
        console.error('Error triggering appointment automations:', error);
        throw error;
    }
}

// Backward compat alias
const triggerSiteVisitScheduled = triggerAppointmentScheduled;

/**
 * Trigger automations for status change
 */
async function triggerStatusChange(lead, oldStatus, newStatus, startAutomationFn) {
    try {
        const automations = await findMatchingAutomations('statusChange', lead);

        // Filter by specific status transitions if configured
        const matchingAutomations = automations.filter(automation => {
            const config = automation.triggerConditions;
            if (config?.fromStatus && config.fromStatus !== oldStatus) return false;
            if (config?.toStatus && config.toStatus !== newStatus) return false;
            return true;
        });

        const results = [];
        for (const automation of matchingAutomations) {
            const result = await startAutomationFn(automation, lead, { oldStatus, newStatus });
            results.push({ automationId: automation._id, result });
        }
        
        return results;
    } catch (error) {
        console.error('Error triggering status change automations:', error);
        throw error;
    }
}

module.exports = {
    matchesTriggerConditions,
    findMatchingAutomations,
    triggerNewLead,
    triggerLeadUpdated,
    triggerAppointmentScheduled,
    triggerSiteVisitScheduled,
    triggerStatusChange
};
