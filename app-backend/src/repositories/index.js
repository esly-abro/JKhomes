/**
 * Repositories Index
 * Export all repositories for clean imports
 */

const leadRepository = require('./leadRepository');
const userRepository = require('./userRepository');
const propertyRepository = require('./propertyRepository');

module.exports = {
    leadRepository,
    userRepository,
    propertyRepository
};
