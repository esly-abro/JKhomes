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

module.exports = {
    User,
    RefreshToken,
    CallLog,
    Activity,
    Lead,
    Automation,
    AutomationRun,
    AutomationJob
};
