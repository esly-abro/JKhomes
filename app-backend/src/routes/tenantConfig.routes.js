/**
 * TenantConfig Routes
 * API endpoints for per-organization CRM configuration.
 */

const tenantConfigController = require('../controllers/tenantConfig.controller');
const { requireRole } = require('../middleware/roles');

async function tenantConfigRoutes(app, options) {
    // GET /api/tenant-config — any authenticated user can read config
    app.get('/api/tenant-config', tenantConfigController.getConfig);

    // PUT /api/tenant-config/categories — owner/admin only
    app.put('/api/tenant-config/categories', {
        preHandler: requireRole(['owner', 'admin'])
    }, tenantConfigController.updateCategories);

    // PUT /api/tenant-config/appointment-types — owner/admin only
    app.put('/api/tenant-config/appointment-types', {
        preHandler: requireRole(['owner', 'admin'])
    }, tenantConfigController.updateAppointmentTypes);

    // PUT /api/tenant-config/modules — owner/admin only
    app.put('/api/tenant-config/modules', {
        preHandler: requireRole(['owner', 'admin'])
    }, tenantConfigController.updateModules);

    // PUT /api/tenant-config/industry — owner/admin only
    app.put('/api/tenant-config/industry', {
        preHandler: requireRole(['owner', 'admin'])
    }, tenantConfigController.updateIndustry);

    // GET /api/tenant-config/category-usage — owner/admin/manager
    app.get('/api/tenant-config/category-usage', {
        preHandler: requireRole(['owner', 'admin', 'manager'])
    }, tenantConfigController.getCategoryUsage);
}

module.exports = tenantConfigRoutes;
