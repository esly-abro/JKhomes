/**
 * AWS Email Service - Integration with AWS Lambda Email Function
 * 
 * This service calls the AWS Lambda function via API Gateway
 * to send various types of emails (new lead, appointments, reminders)
 */

const axios = require('axios');

const AWS_EMAIL_API_ENDPOINT = process.env.AWS_EMAIL_API_ENDPOINT;
const AWS_EMAIL_API_KEY = process.env.AWS_EMAIL_API_KEY;
const ADMIN_EMAIL = process.env.LEAD_NOTIFICATION_EMAIL;
const COMPANY_NAME = process.env.COMPANY_NAME || 'Our Company';

/**
 * Check if AWS Email service is configured
 */
function isConfigured() {
    return !!(AWS_EMAIL_API_ENDPOINT && AWS_EMAIL_API_KEY);
}

/**
 * Send email via AWS Lambda
 * @param {Object} payload - Email payload
 * @returns {Promise<Object>} - API response
 */
async function sendEmail(payload) {
    if (!isConfigured()) {
        console.warn('⚠️ AWS Email service not configured. Skipping email.');
        return { success: false, error: 'AWS Email not configured' };
    }

    try {
        const response = await axios.post(AWS_EMAIL_API_ENDPOINT, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': AWS_EMAIL_API_KEY
            },
            timeout: 30000
        });

        console.log('✅ AWS Email sent successfully:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ AWS Email failed:', error.response?.data || error.message);
        return { 
            success: false, 
            error: error.response?.data?.error || error.message 
        };
    }
}

/**
 * Send new lead notification to admin
 * @param {Object} lead - Lead data
 * @param {string} adminEmail - Admin email (optional, defaults to env)
 */
async function sendNewLeadEmail(lead, adminEmail = ADMIN_EMAIL, tenantLabels = {}) {
    return sendEmail({
        type: 'NEW_LEAD',
        to: adminEmail,
        lead: {
            id: lead._id || lead.zohoId || lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            source: lead.source,
            propertyInterest: lead.category || lead.propertyType || lead.propertyInterest,
            budget: lead.budget,
            location: lead.preferredLocation || lead.location,
            notes: lead.notes,
            createdAt: lead.createdAt || new Date()
        },
        metadata: { companyName: COMPANY_NAME, ...tenantLabels }
    });
}

/**
 * Send appointment/site visit confirmation email
 * @param {Object} lead - Lead data
 * @param {Object} appointment - Appointment/site visit data
 * @param {Object} property - Property data (optional)
 * @param {string} adminEmail - Admin email (optional)
 */
async function sendSiteVisitEmail(lead, siteVisit, property = null, adminEmail = ADMIN_EMAIL, tenantLabels = {}) {
    return sendEmail({
        type: 'APPOINTMENT_SCHEDULED',
        to: adminEmail,
        adminEmail: adminEmail,
        lead: {
            name: lead.name || siteVisit.leadName,
            email: lead.email,
            phone: lead.phone || siteVisit.leadPhone
        },
        siteVisit: {
            id: siteVisit._id || siteVisit.id,
            scheduledAt: siteVisit.scheduledAt,
            agentName: siteVisit.agentName || 'TBD',
            duration: siteVisit.duration || 60
        },
        property: property ? {
            name: property.name,
            address: property.address,
            location: property.location
        } : null,
        metadata: { companyName: COMPANY_NAME, ...tenantLabels }
    });
}

/**
 * Send lead status update notification
 * @param {Object} lead - Lead data
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {string} adminEmail - Admin email (optional)
 */
async function sendStatusUpdateEmail(lead, fromStatus, toStatus, adminEmail = ADMIN_EMAIL, tenantLabels = {}) {
    return sendEmail({
        type: 'LEAD_STATUS_UPDATE',
        to: adminEmail,
        lead: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone
        },
        statusChange: {
            from: fromStatus,
            to: toStatus
        },
        metadata: { companyName: COMPANY_NAME, ...tenantLabels }
    });
}

/**
 * Send test email
 * @param {string} to - Recipient email
 */
async function sendTestEmail(to) {
    return sendEmail({
        type: 'TEST',
        to: to,
        subject: `🔧 Test Email - ${COMPANY_NAME}`,
        metadata: { companyName: COMPANY_NAME }
    });
}

/**
 * Send reminder email (usually called by the scheduler Lambda)
 * Can also be called manually from backend
 * @param {string} reminderType - 'REMINDER_1_DAY' or 'REMINDER_TODAY'
 * @param {Object} lead - Lead data
 * @param {Object} siteVisit - Site visit data
 * @param {Object} property - Property data (optional)
 */
async function sendReminderEmail(reminderType, lead, siteVisit, property = null, tenantLabels = {}) {
    return sendEmail({
        type: reminderType,
        lead: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone
        },
        siteVisit: {
            scheduledAt: siteVisit.scheduledAt,
            agentName: siteVisit.agentName
        },
        property: property ? {
            name: property.name,
            address: property.address,
            location: property.location
        } : null,
        metadata: { companyName: COMPANY_NAME, ...tenantLabels }
    });
}

module.exports = {
    isConfigured,
    sendEmail,
    sendNewLeadEmail,
    sendSiteVisitEmail,
    sendAppointmentEmail: sendSiteVisitEmail, // Generic alias
    sendStatusUpdateEmail,
    sendTestEmail,
    sendReminderEmail
};
