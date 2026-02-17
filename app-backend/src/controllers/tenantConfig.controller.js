/**
 * TenantConfig Controller
 * Handles CRUD operations for per-organization CRM configuration.
 * Currently manages: categories (was propertyType).
 * Will expand to: statuses, sources, appointment types, field labels, etc.
 */

const TenantConfig = require('../models/tenantConfig.model.js');
const Lead = require('../models/Lead');

class TenantConfigController {
    /**
     * GET /api/tenant-config
     * Returns the current org's config, or creates one from defaults.
     */
    async getConfig(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const config = await TenantConfig.getOrCreate(orgId);
            return reply.code(200).send(config);
        } catch (error) {
            console.error('[TenantConfig] getConfig error:', error);
            return reply.code(500).send({ error: 'Failed to load tenant configuration' });
        }
    }

    /**
     * PUT /api/tenant-config/categories
     * Update the list of categories (was propertyTypes).
     * Body: { categories: [{ key, label, isActive, order }], categoryFieldLabel?: string }
     */
    async updateCategories(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const { categories, categoryFieldLabel } = req.body;

            if (!categories || !Array.isArray(categories)) {
                return reply.code(400).send({ error: 'categories must be an array' });
            }

            // Validate each category has key + label
            for (const cat of categories) {
                if (!cat.key || !cat.label) {
                    return reply.code(400).send({
                        error: 'Each category must have a key and label',
                        invalidCategory: cat
                    });
                }
            }

            // Check for duplicate keys
            const keys = categories.map(c => c.key.toLowerCase().trim());
            const uniqueKeys = new Set(keys);
            if (uniqueKeys.size !== keys.length) {
                return reply.code(400).send({ error: 'Duplicate category keys are not allowed' });
            }

            const config = await TenantConfig.getOrCreate(orgId);

            // If org has config doc (not the in-memory default), update it
            if (config._id) {
                config.categories = categories.map((cat, idx) => ({
                    key: cat.key.toLowerCase().trim(),
                    label: cat.label.trim(),
                    isActive: cat.isActive !== false,
                    order: cat.order ?? idx
                }));

                if (categoryFieldLabel) {
                    config.categoryFieldLabel = categoryFieldLabel.trim();
                }

                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateCategories error:', error);
            return reply.code(500).send({ error: 'Failed to update categories' });
        }
    }

    /**
     * PUT /api/tenant-config/modules
     * Enable/disable feature modules.
     * Body: { catalog?: boolean, appointments?: boolean, broadcasts?: boolean, aiCalling?: boolean }
     */
    async updateModules(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const modules = req.body;

            const config = await TenantConfig.getOrCreate(orgId);

            if (config._id) {
                if (modules.catalog !== undefined) config.enabledModules.catalog = modules.catalog;
                if (modules.appointments !== undefined) config.enabledModules.appointments = modules.appointments;
                if (modules.broadcasts !== undefined) config.enabledModules.broadcasts = modules.broadcasts;
                if (modules.aiCalling !== undefined) config.enabledModules.aiCalling = modules.aiCalling;
                if (modules.knowledgeBase !== undefined) config.enabledModules.knowledgeBase = modules.knowledgeBase;

                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateModules error:', error);
            return reply.code(500).send({ error: 'Failed to update modules' });
        }
    }

    /**
     * PUT /api/tenant-config/industry
     * Set the industry for this org and optionally reset categories/appointment types to industry defaults.
     * Body: { industry: string, resetCategories?: boolean }
     */
    async updateIndustry(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const { industry, resetCategories } = req.body;

            const validIndustries = ['real_estate', 'saas', 'healthcare', 'education', 'insurance', 'finance', 'automotive', 'generic'];
            if (!validIndustries.includes(industry)) {
                return reply.code(400).send({
                    error: `Invalid industry. Must be one of: ${validIndustries.join(', ')}`
                });
            }

            const config = await TenantConfig.getOrCreate(orgId);

            if (config._id) {
                config.industry = industry;
                if (resetCategories) {
                    config.categories = TenantConfig.getDefaultCategories(industry);
                    config.categoryFieldLabel = TenantConfig.getDefaultCategoryFieldLabel(industry);
                    config.leadStatuses = TenantConfig.getDefaultLeadStatuses(industry);
                    config.appointmentTypes = TenantConfig.getDefaultAppointmentTypes(industry);
                    config.appointmentFieldLabel = TenantConfig.getDefaultAppointmentFieldLabel(industry);
                    config.locationFieldLabel = TenantConfig.getDefaultLocationFieldLabel(industry);
                }
                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateIndustry error:', error);
            return reply.code(500).send({ error: 'Failed to update industry' });
        }
    }

    /**
     * PUT /api/tenant-config/appointment-types
     * Update the list of appointment types.
     * Body: { appointmentTypes: [{ key, label, isActive, order }], appointmentFieldLabel?: string }
     */
    async updateAppointmentTypes(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const { appointmentTypes, appointmentFieldLabel } = req.body;

            if (!appointmentTypes || !Array.isArray(appointmentTypes)) {
                return reply.code(400).send({ error: 'appointmentTypes must be an array' });
            }

            // Validate each appointment type has key + label
            for (const apt of appointmentTypes) {
                if (!apt.key || !apt.label) {
                    return reply.code(400).send({
                        error: 'Each appointment type must have a key and label',
                        invalidAppointmentType: apt
                    });
                }
            }

            // Check for duplicate keys
            const keys = appointmentTypes.map(a => a.key.toLowerCase().trim());
            const uniqueKeys = new Set(keys);
            if (uniqueKeys.size !== keys.length) {
                return reply.code(400).send({ error: 'Duplicate appointment type keys are not allowed' });
            }

            const config = await TenantConfig.getOrCreate(orgId);

            if (config._id) {
                config.appointmentTypes = appointmentTypes.map((apt, idx) => ({
                    key: apt.key.toLowerCase().trim(),
                    label: apt.label.trim(),
                    isActive: apt.isActive !== false,
                    order: apt.order ?? idx
                }));

                if (appointmentFieldLabel) {
                    config.appointmentFieldLabel = appointmentFieldLabel.trim();
                }

                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateAppointmentTypes error:', error);
            return reply.code(500).send({ error: 'Failed to update appointment types' });
        }
    }

    /**
     * GET /api/tenant-config/category-usage
     * Returns the count of leads using each category. 
     * Useful before deleting a category to show how many leads would be affected.
     */
    async getCategoryUsage(req, reply) {
        try {
            const orgId = req.user?.organizationId;
            const matchStage = { category: { $ne: null, $exists: true } };
            if (orgId) matchStage.organizationId = orgId;

            const usage = await Lead.aggregate([
                { $match: matchStage },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            const result = {};
            usage.forEach(item => {
                result[item._id] = item.count;
            });

            return reply.code(200).send(result);
        } catch (error) {
            console.error('[TenantConfig] getCategoryUsage error:', error);
            return reply.code(500).send({ error: 'Failed to get category usage' });
        }
    }
    /**
     * PUT /api/tenant-config/location-label
     * Update the location field label.
     * Body: { locationFieldLabel: string }
     */
    async updateLocationLabel(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const { locationFieldLabel } = req.body;

            if (!locationFieldLabel || typeof locationFieldLabel !== 'string' || !locationFieldLabel.trim()) {
                return reply.code(400).send({ error: 'locationFieldLabel is required and must be a non-empty string' });
            }

            const config = await TenantConfig.getOrCreate(orgId);

            if (config._id) {
                config.locationFieldLabel = locationFieldLabel.trim();
                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateLocationLabel error:', error);
            return reply.code(500).send({ error: 'Failed to update location label' });
        }
    }

    /**
     * PUT /api/tenant-config/lead-statuses
     * Update the lead status pipeline (custom stages/funnel).
     * Body: { leadStatuses: [{ key, label, color, isActive, isClosed, order }] }
     */
    async updateLeadStatuses(req, reply) {
        try {
            const orgId = req.user?.organizationId || null;
            const { leadStatuses } = req.body;

            if (!leadStatuses || !Array.isArray(leadStatuses)) {
                return reply.code(400).send({ error: 'leadStatuses must be an array' });
            }

            if (leadStatuses.length < 2) {
                return reply.code(400).send({ error: 'At least 2 lead statuses are required' });
            }

            // Validate each status has key + label
            for (const status of leadStatuses) {
                if (!status.key || !status.label) {
                    return reply.code(400).send({
                        error: 'Each lead status must have a key and label',
                        invalidStatus: status
                    });
                }
            }

            // Check for duplicate keys
            const keys = leadStatuses.map(s => s.key.trim());
            const uniqueKeys = new Set(keys);
            if (uniqueKeys.size !== keys.length) {
                return reply.code(400).send({ error: 'Duplicate status keys are not allowed' });
            }

            // Must have at least one non-closed status
            const hasOpen = leadStatuses.some(s => !s.isClosed && s.isActive !== false);
            if (!hasOpen) {
                return reply.code(400).send({ error: 'At least one open (non-closed) status is required' });
            }

            const config = await TenantConfig.getOrCreate(orgId);

            if (config._id) {
                config.leadStatuses = leadStatuses.map((s, idx) => ({
                    key: s.key.trim(),
                    label: s.label.trim(),
                    color: s.color || '#6b7280',
                    isActive: s.isActive !== false,
                    isClosed: s.isClosed === true,
                    order: s.order ?? idx
                }));

                await config.save();
                return reply.code(200).send(config);
            }
        } catch (error) {
            console.error('[TenantConfig] updateLeadStatuses error:', error);
            return reply.code(500).send({ error: 'Failed to update lead statuses' });
        }
    }

    /**
     * GET /api/tenant-config/status-usage
     * Returns the count of leads using each status.
     * Useful before deleting a status to show how many leads would be affected.
     */
    async getStatusUsage(req, reply) {
        try {
            const orgId = req.user?.organizationId;
            const matchStage = { status: { $ne: null, $exists: true } };
            if (orgId) matchStage.organizationId = orgId;

            const usage = await Lead.aggregate([
                { $match: matchStage },
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            const result = {};
            usage.forEach(item => {
                result[item._id] = item.count;
            });

            return reply.code(200).send(result);
        } catch (error) {
            console.error('[TenantConfig] getStatusUsage error:', error);
            return reply.code(500).send({ error: 'Failed to get status usage' });
        }
    }
}

module.exports = new TenantConfigController();
