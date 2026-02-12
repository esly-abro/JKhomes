/**
 * Models Index
 * Export all MongoDB models
 */

const User = require('./User');
const RefreshToken = require('./RefreshToken');
const CallLog = require('./CallLog');
const Activity = require('./Activity');
const Lead = require('./Lead');
const Automation = require('./Automation');
const AutomationRun = require('./AutomationRun');
const AutomationJob = require('./AutomationJob');
const TenantConfig = require('./tenantConfig.model');
const SiteVisit = require('./SiteVisit');
// Appointment is an alias for SiteVisit (generic naming)
const Appointment = SiteVisit;

module.exports = {
    User,
    RefreshToken,
    CallLog,
    Activity,
    Lead,
    Automation,
    AutomationRun,
    AutomationJob,
    TenantConfig,
    SiteVisit,
    Appointment
};
