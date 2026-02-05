/**
 * Services Index
 * Export all services for clean imports
 */

const leadService = require('./lead.service');
const userService = require('./user.service');
const availabilityService = require('./availability.service');
const emailService = require('./email.service');
const googleSheetsService = require('./googleSheets.service');
const whatsappService = require('./whatsapp.service');
const elevenLabsService = require('./elevenLabs.service');
const workflowEngine = require('./workflow.engine');

module.exports = {
    leadService,
    userService,
    availabilityService,
    emailService,
    googleSheetsService,
    whatsappService,
    elevenLabsService,
    workflowEngine
};
