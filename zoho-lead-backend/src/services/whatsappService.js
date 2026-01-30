/**
 * WhatsApp Service
 * Handles WhatsApp messaging via Twilio WhatsApp Business API
 * 
 * Features:
 * - Send text messages via WhatsApp
 * - Send media (images, PDFs, brochures)
 * - Template message support for business-initiated conversations
 * - Status tracking and delivery receipts
 * 
 * SETUP REQUIRED:
 * 1. Enable WhatsApp on your Twilio number: https://www.twilio.com/docs/whatsapp/self-sign-up
 * 2. Connect Meta Business Manager account
 * 3. Create and approve message templates in Twilio Console
 */

const twilio = require('twilio');
const config = require('../config/config');
const logger = require('../utils/logger');

class WhatsAppService {
    constructor() {
        if (!config.twilio.accountSid || !config.twilio.authToken) {
            logger.warn('Twilio credentials not configured - WhatsApp service disabled');
            this.client = null;
        } else {
            this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
            logger.info('WhatsApp service initialized via Twilio');
        }

        // WhatsApp-enabled Twilio number (must be approved for WhatsApp)
        this.whatsappNumber = config.twilio.whatsappNumber || config.twilio.phoneNumber;
        
        // Base URL for media/brochures
        this.mediaBaseUrl = config.server?.baseUrl || process.env.SERVER_URL || 'https://jkconstruction.com';
        
        // Message templates (pre-approved in Twilio Console)
        this.templates = {
            PROPERTY_DETAILS: 'property_details_template',
            SITE_VISIT_CONFIRMATION: 'site_visit_confirmation',
            BOOKING_LINK: 'booking_link_template',
            FOLLOW_UP: 'follow_up_template'
        };
    }

    /**
     * Format phone number for WhatsApp (E.164 with whatsapp: prefix)
     * @param {string} phoneNumber - Raw phone number
     * @returns {string} WhatsApp formatted number
     */
    formatWhatsAppNumber(phoneNumber) {
        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Add country code if missing (default to India +91)
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }
        
        // Ensure it starts with country code
        if (!cleaned.startsWith('91') && cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }

        return `whatsapp:+${cleaned}`;
    }

    /**
     * Format the sender number for WhatsApp
     * @returns {string} WhatsApp formatted sender number
     */
    getFromNumber() {
        const from = this.whatsappNumber.replace(/\D/g, '');
        return `whatsapp:+${from}`;
    }

    /**
     * Send a WhatsApp text message
     * @param {string} toNumber - Recipient phone number
     * @param {string} message - Message text
     * @param {object} options - Additional options (statusCallback, etc.)
     * @returns {Promise<object>} Send result
     */
    async sendMessage(toNumber, message, options = {}) {
        if (!this.client) {
            logger.error('WhatsApp service not initialized - cannot send message');
            return { success: false, error: 'WhatsApp service not configured' };
        }

        try {
            const to = this.formatWhatsAppNumber(toNumber);
            const from = this.getFromNumber();

            logger.info('Sending WhatsApp message', {
                to: this.maskPhoneNumber(toNumber),
                messageLength: message.length
            });

            const messageParams = {
                body: message,
                from: from,
                to: to
            };

            // Add status callback if provided
            if (options.statusCallback) {
                messageParams.statusCallback = options.statusCallback;
            }

            const result = await this.client.messages.create(messageParams);

            logger.info('WhatsApp message sent successfully', {
                sid: result.sid,
                status: result.status,
                to: this.maskPhoneNumber(toNumber)
            });

            return {
                success: true,
                messageSid: result.sid,
                status: result.status,
                dateCreated: result.dateCreated
            };

        } catch (error) {
            logger.error('Failed to send WhatsApp message', {
                error: error.message,
                code: error.code,
                to: this.maskPhoneNumber(toNumber)
            });

            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    /**
     * Send a WhatsApp message with media (image, PDF, etc.)
     * @param {string} toNumber - Recipient phone number
     * @param {string} message - Message text
     * @param {string|string[]} mediaUrls - URL(s) of media to attach
     * @returns {Promise<object>} Send result
     */
    async sendMediaMessage(toNumber, message, mediaUrls) {
        if (!this.client) {
            logger.error('WhatsApp service not initialized');
            return { success: false, error: 'WhatsApp service not configured' };
        }

        try {
            const to = this.formatWhatsAppNumber(toNumber);
            const from = this.getFromNumber();

            // Ensure mediaUrls is an array
            const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];

            logger.info('Sending WhatsApp media message', {
                to: this.maskPhoneNumber(toNumber),
                mediaCount: urls.length
            });

            const result = await this.client.messages.create({
                body: message,
                from: from,
                to: to,
                mediaUrl: urls
            });

            logger.info('WhatsApp media message sent successfully', {
                sid: result.sid,
                status: result.status
            });

            return {
                success: true,
                messageSid: result.sid,
                status: result.status
            };

        } catch (error) {
            logger.error('Failed to send WhatsApp media message', {
                error: error.message,
                code: error.code
            });

            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    /**
     * Send property details with brochure via WhatsApp
     * @param {string} toNumber - Recipient phone number
     * @param {object} propertyDetails - Property information
     * @returns {Promise<object>} Send result
     */
    async sendPropertyDetails(toNumber, propertyDetails) {
        const {
            propertyName = 'Premium Property',
            location = 'Chennai',
            priceRange = '₹50L - ₹1Cr',
            amenities = [],
            brochureUrl = null,
            virtualTourUrl = null
        } = propertyDetails;

        // Construct detailed message
        let message = `🏠 *${propertyName}*\n\n`;
        message += `📍 *Location:* ${location}\n`;
        message += `💰 *Price Range:* ${priceRange}\n`;
        
        if (amenities.length > 0) {
            message += `\n✨ *Amenities:*\n`;
            amenities.forEach(amenity => {
                message += `  • ${amenity}\n`;
            });
        }

        if (virtualTourUrl) {
            message += `\n🎥 *Virtual Tour:* ${virtualTourUrl}\n`;
        }

        message += `\n📞 Call us for more details or to schedule a site visit!`;
        message += `\n\n_JK Construction - Building Dreams Since 1995_`;

        // Send with brochure if available
        if (brochureUrl) {
            return await this.sendMediaMessage(toNumber, message, brochureUrl);
        } else {
            return await this.sendMessage(toNumber, message);
        }
    }

    /**
     * Send site visit confirmation via WhatsApp
     * @param {string} toNumber - Recipient phone number
     * @param {object} visitDetails - Visit booking details
     * @returns {Promise<object>} Send result
     */
    async sendSiteVisitConfirmation(toNumber, visitDetails) {
        const {
            customerName = 'Valued Customer',
            propertyName = 'Our Property',
            visitDate = 'TBD',
            visitTime = 'TBD',
            location = 'Chennai',
            contactPerson = 'Site Manager',
            contactNumber = '+91 98xxx xxxxx',
            mapLink = null
        } = visitDetails;

        let message = `✅ *Site Visit Confirmed!*\n\n`;
        message += `Dear ${customerName},\n\n`;
        message += `Your site visit has been scheduled:\n\n`;
        message += `🏠 *Property:* ${propertyName}\n`;
        message += `📅 *Date:* ${visitDate}\n`;
        message += `⏰ *Time:* ${visitTime}\n`;
        message += `📍 *Location:* ${location}\n`;

        if (mapLink) {
            message += `🗺️ *Directions:* ${mapLink}\n`;
        }

        message += `\n👤 *Contact Person:* ${contactPerson}\n`;
        message += `📞 *Contact:* ${contactNumber}\n`;

        message += `\n_Please arrive 10 minutes early. Looking forward to meeting you!_\n`;
        message += `\n_JK Construction_`;

        return await this.sendMessage(toNumber, message);
    }

    /**
     * Send booking link via WhatsApp
     * @param {string} toNumber - Recipient phone number
     * @param {string} leadId - Lead ID for tracking
     * @param {string} customerName - Customer's name
     * @returns {Promise<object>} Send result
     */
    async sendBookingLink(toNumber, leadId, customerName = 'Valued Customer') {
        const bookingUrl = `${this.mediaBaseUrl}/book-visit?id=${leadId}&utm_source=whatsapp`;

        let message = `Hello ${customerName}! 👋\n\n`;
        message += `Thank you for your interest in JK Construction properties! 🏠\n\n`;
        message += `📅 *Book Your Site Visit:*\n`;
        message += `${bookingUrl}\n\n`;
        message += `Choose your preferred date and time slot through the link above.\n\n`;
        message += `For immediate assistance, call us at ${this.whatsappNumber}\n\n`;
        message += `_JK Construction - Your Dream Home Awaits!_`;

        return await this.sendMessage(toNumber, message);
    }

    /**
     * Send follow-up message after AI call
     * @param {string} toNumber - Recipient phone number
     * @param {object} followUpDetails - Follow-up details
     * @returns {Promise<object>} Send result
     */
    async sendFollowUpMessage(toNumber, followUpDetails) {
        const {
            customerName = 'Valued Customer',
            callSummary = '',
            nextSteps = [],
            brochureUrl = null
        } = followUpDetails;

        let message = `Hello ${customerName}! 👋\n\n`;
        message += `Thank you for speaking with us today! Here's a quick summary:\n\n`;
        
        if (callSummary) {
            message += `📝 *Summary:*\n${callSummary}\n\n`;
        }

        if (nextSteps.length > 0) {
            message += `✅ *Next Steps:*\n`;
            nextSteps.forEach((step, i) => {
                message += `${i + 1}. ${step}\n`;
            });
            message += `\n`;
        }

        message += `Feel free to reply to this message or call us anytime!\n\n`;
        message += `_JK Construction_`;

        if (brochureUrl) {
            return await this.sendMediaMessage(toNumber, message, brochureUrl);
        } else {
            return await this.sendMessage(toNumber, message);
        }
    }

    /**
     * Send quick reply message with options
     * Note: Interactive messages require WhatsApp Business API approval
     * This is a text-based alternative
     * @param {string} toNumber - Recipient phone number
     * @param {string} question - Question to ask
     * @param {string[]} options - Reply options
     * @returns {Promise<object>} Send result
     */
    async sendQuickReplyMessage(toNumber, question, options) {
        let message = `${question}\n\n`;
        message += `Please reply with:\n`;
        options.forEach((option, index) => {
            message += `*${index + 1}* - ${option}\n`;
        });

        return await this.sendMessage(toNumber, message);
    }

    /**
     * Mask phone number for logging
     * @private
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber) return 'unknown';
        const cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.length < 6) return '****';
        return cleaned.slice(0, 4) + '****' + cleaned.slice(-2);
    }

    /**
     * Check if WhatsApp service is available
     * @returns {boolean} Service availability
     */
    isAvailable() {
        return !!this.client;
    }

    /**
     * Get message status
     * @param {string} messageSid - Twilio message SID
     * @returns {Promise<object>} Message status
     */
    async getMessageStatus(messageSid) {
        if (!this.client) {
            return { success: false, error: 'WhatsApp service not configured' };
        }

        try {
            const message = await this.client.messages(messageSid).fetch();
            return {
                success: true,
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateSent: message.dateSent,
                dateDelivered: message.dateDelivered
            };
        } catch (error) {
            logger.error('Failed to fetch message status', {
                error: error.message,
                messageSid
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new WhatsAppService();
