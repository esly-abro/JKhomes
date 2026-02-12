/**
 * Google Sheets Service
 * Syncs property data to Google Sheets for ElevenLabs AI agent access
 * Sheet URL: https://docs.google.com/spreadsheets/d/1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw/edit
 */

const axios = require('axios');

// Google Sheets configuration
const SPREADSHEET_ID = '1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw';
const SHEET_NAME = 'Properties';
const SITE_VISITS_SHEET = 'ScheduledVisits';

// You'll need to set up Google Sheets API credentials
// Option 1: Use a Service Account (recommended for server-side)
// Option 2: Use Google Apps Script Web App (easier setup)

class GoogleSheetsService {
    constructor() {
        this.apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        this.serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        this.serviceAccountPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        this.webAppUrl = process.env.GOOGLE_APPS_SCRIPT_URL; // For Apps Script deployment
        
        // Headers for the properties sheet
        this.headers = [
            'Property ID',
            'Name',
            'Category',
            'Location',
            'Status',
            'Price Min (INR)',
            'Price Max (INR)',
            'Size (sqft)',
            'Bedrooms',
            'Bathrooms',
            'Description',
            'Amenities',
            'Assigned Agent',
            'Agent Phone',
            'Agent Email',
            'Interested Leads Count',
            // Site Visit Availability
            'Site Visits Enabled',
            'Available Days',
            'Time Slots',
            'Slot Duration (mins)',
            'Buffer Time (mins)',
            'Max Visits Per Day',
            'Advance Booking Days',
            'Min Advance Hours',
            'Blocked Dates',
            'Special Hours/Closures',
            // Timestamps
            'Created At',
            'Updated At',
            'Last Synced'
        ];

        // Headers for scheduled site visits sheet
        this.siteVisitHeaders = [
            'Visit ID',
            'Property ID',
            'Property Name',
            'Property Location',
            'Lead Name',
            'Lead Phone',
            'Scheduled Date',
            'Time Slot',
            'Duration (mins)',
            'Status',
            'Agent Name',
            'Notes',
            'Created At',
            'Last Updated'
        ];
    }

    /**
     * Format property data for Google Sheets
     */
    formatPropertyForSheet(property) {
        const availability = property.availability || {};
        const weekdays = availability.weekdays || {};
        
        // Format available days
        const availableDays = Object.entries(weekdays)
            .filter(([_, isAvailable]) => isAvailable)
            .map(([day]) => day.charAt(0).toUpperCase() + day.slice(1))
            .join(', ');

        // Format time slots
        const timeSlots = (availability.timeSlots || [])
            .map(slot => `${slot.startTime}-${slot.endTime}`)
            .join(', ');

        // Format blocked dates
        const blockedDates = (availability.blockedDates || [])
            .map(date => new Date(date).toLocaleDateString('en-IN'))
            .join(', ');

        // Format special hours
        const specialHours = (availability.specialHours || [])
            .map(sh => {
                const dateStr = new Date(sh.date).toLocaleDateString('en-IN');
                if (sh.isClosed) return `${dateStr}: CLOSED`;
                const slots = (sh.timeSlots || []).map(s => `${s.startTime}-${s.endTime}`).join(', ');
                return `${dateStr}: ${slots}`;
            })
            .join(' | ');

        // Format amenities
        const amenities = (property.amenities || []).join(', ');

        // Get agent info
        const agent = property.assignedAgent || {};
        
        return [
            property._id?.toString() || '',
            property.name || '',
            property.category || property.propertyType || '',
            property.location || '',
            property.status || 'Available',
            property.price?.min?.toString() || '',
            property.price?.max?.toString() || '',
            property.size?.value?.toString() || '',
            property.bedrooms?.toString() || '',
            property.bathrooms?.toString() || '',
            property.description || '',
            amenities,
            agent.name || '',
            agent.phone || '',
            agent.email || '',
            property.interestedLeadsCount?.toString() || '0',
            // Availability
            availability.enabled !== false ? 'Yes' : 'No',
            availableDays || 'Mon-Sat',
            timeSlots || '09:00-17:00',
            availability.slotDuration?.toString() || '60',
            availability.bufferTime?.toString() || '30',
            availability.maxVisitsPerDay?.toString() || '8',
            availability.advanceBookingDays?.toString() || '30',
            availability.minAdvanceHours?.toString() || '2',
            blockedDates || 'None',
            specialHours || 'None',
            // Timestamps
            property.createdAt ? new Date(property.createdAt).toLocaleString('en-IN') : '',
            property.updatedAt ? new Date(property.updatedAt).toLocaleString('en-IN') : '',
            new Date().toLocaleString('en-IN')
        ];
    }

    /**
     * Sync a single property to Google Sheets (update or insert)
     */
    async syncProperty(property) {
        try {
            console.log(`[GoogleSheets] Syncing property: ${property.name} (${property._id})`);
            
            const rowData = this.formatPropertyForSheet(property);
            
            // Use Google Apps Script Web App for easier integration
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'upsertProperty',
                    propertyId: property._id.toString(),
                    data: rowData,
                    headers: this.headers
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                });

                console.log(`[GoogleSheets] Property synced successfully: ${property.name}`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured. Set GOOGLE_APPS_SCRIPT_URL in .env');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error(`[GoogleSheets] Error syncing property ${property._id}:`, error.message);
            throw error;
        }
    }

    /**
     * Sync all properties to Google Sheets (full refresh)
     */
    async syncAllProperties(properties) {
        try {
            console.log(`[GoogleSheets] Starting full sync of ${properties.length} properties`);
            
            const allRows = properties.map(p => this.formatPropertyForSheet(p));
            
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'syncAllProperties',
                    headers: this.headers,
                    data: allRows
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                });

                console.log(`[GoogleSheets] Full sync completed: ${properties.length} properties`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error('[GoogleSheets] Error during full sync:', error.message);
            throw error;
        }
    }

    /**
     * Delete a property from Google Sheets
     */
    async deleteProperty(propertyId) {
        try {
            console.log(`[GoogleSheets] Deleting property: ${propertyId}`);
            
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'deleteProperty',
                    propertyId: propertyId.toString()
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                });

                console.log(`[GoogleSheets] Property deleted from sheet: ${propertyId}`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error(`[GoogleSheets] Error deleting property ${propertyId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get sync status
     */
    async getSyncStatus() {
        try {
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'getStatus'
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
                return response.data;
            }
            return { configured: false, message: 'Google Sheets not configured' };
        } catch (error) {
            return { configured: true, error: error.message };
        }
    }

    // =====================================================
    // SITE VISIT SYNC METHODS
    // =====================================================

    /**
     * Format site visit data for Google Sheets
     */
    formatSiteVisitForSheet(visit) {
        const property = visit.propertyId || {};
        
        // Format scheduled date and time
        const scheduledDate = visit.scheduledAt 
            ? new Date(visit.scheduledAt).toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })
            : '';
        
        const timeSlot = visit.timeSlot 
            ? `${visit.timeSlot.startTime} - ${visit.timeSlot.endTime}`
            : (visit.scheduledAt 
                ? new Date(visit.scheduledAt).toLocaleTimeString('en-IN', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })
                : '');

        return [
            visit._id?.toString() || '',
            typeof property === 'object' ? property._id?.toString() : property?.toString() || '',
            property.name || '',
            property.location || '',
            visit.leadName || '',
            visit.leadPhone || '',
            scheduledDate,
            timeSlot,
            visit.duration?.toString() || '60',
            visit.status || 'scheduled',
            visit.agentName || '',
            visit.notes || '',
            visit.createdAt ? new Date(visit.createdAt).toLocaleString('en-IN') : '',
            new Date().toLocaleString('en-IN')
        ];
    }

    /**
     * Sync a single site visit to Google Sheets
     */
    async syncSiteVisit(visit) {
        try {
            console.log(`[GoogleSheets] Syncing site visit: ${visit._id}`);
            
            const rowData = this.formatSiteVisitForSheet(visit);
            
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'upsertSiteVisit',
                    visitId: visit._id.toString(),
                    data: rowData,
                    headers: this.siteVisitHeaders
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                });

                console.log(`[GoogleSheets] Site visit synced successfully: ${visit._id}`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error(`[GoogleSheets] Error syncing site visit ${visit._id}:`, error.message);
            throw error;
        }
    }

    /**
     * Sync all scheduled site visits to Google Sheets
     */
    async syncAllSiteVisits(visits) {
        try {
            console.log(`[GoogleSheets] Starting full sync of ${visits.length} site visits`);
            
            const allRows = visits.map(v => this.formatSiteVisitForSheet(v));
            
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'syncAllSiteVisits',
                    headers: this.siteVisitHeaders,
                    data: allRows
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                });

                console.log(`[GoogleSheets] Site visits sync completed: ${visits.length} visits`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error('[GoogleSheets] Error during site visits sync:', error.message);
            throw error;
        }
    }

    /**
     * Delete a site visit from Google Sheets
     */
    async deleteSiteVisit(visitId) {
        try {
            console.log(`[GoogleSheets] Deleting site visit: ${visitId}`);
            
            if (this.webAppUrl) {
                const response = await axios.post(this.webAppUrl, {
                    action: 'deleteSiteVisit',
                    visitId: visitId.toString()
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                });

                console.log(`[GoogleSheets] Site visit deleted from sheet: ${visitId}`);
                return response.data;
            } else {
                console.warn('[GoogleSheets] No Google Apps Script URL configured');
                return { success: false, error: 'Google Sheets not configured' };
            }
        } catch (error) {
            console.error(`[GoogleSheets] Error deleting site visit ${visitId}:`, error.message);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService();
