/**
 * AWS Lambda Function - Lead Email Notification Service
 * 
 * Complete Email Automation for JK Construction:
 * 1️⃣ NEW_LEAD - Lead created notification
 * 2️⃣ SITE_VISIT_SCHEDULED - Confirmation + Calendar invite
 * 3️⃣ REMINDER_1_DAY - 1 day before visit
 * 4️⃣ REMINDER_TODAY - On visit day
 * 
 * Environment Variables:
 * - SES_FROM_EMAIL: Your verified SES sender email
 * - COMPANY_NAME: Company name (default: JK Construction)
 * - COMPANY_PHONE: Contact phone number
 * - REGION: AWS region (default: ap-south-1)
 */

const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');

// Initialize SES Client
const sesClient = new SESClient({
    region: process.env.REGION || 'ap-south-1'
});

const COMPANY_NAME = process.env.COMPANY_NAME || 'JK Construction';
const FROM_EMAIL = process.env.SES_FROM_EMAIL;
const COMPANY_PHONE = process.env.COMPANY_PHONE || '+91 98765 43210';

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Kolkata'
    });
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    });
}

// ============================================
// ICS CALENDAR INVITE GENERATOR
// ============================================

function generateICSCalendarInvite(lead, siteVisit, property, companyName) {
    const startDate = new Date(siteVisit.scheduledAt);
    const endDate = new Date(startDate.getTime() + (siteVisit.duration || 60) * 60000);
    
    const formatICSDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    
    const uid = `sitevisit-${siteVisit.id || Date.now()}@jkconstruction`;
    const location = property?.address || property?.location || 'Address will be shared';
    
    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${companyName}//Site Visit//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
DTSTAMP:${formatICSDate(new Date())}
UID:${uid}
SUMMARY:🏠 Site Visit - ${property?.name || companyName}
LOCATION:${location}
DESCRIPTION:Site Visit with ${companyName}\\nProperty: ${property?.name || 'TBD'}\\nContact: ${COMPANY_PHONE}
STATUS:CONFIRMED
ORGANIZER;CN=${companyName}:mailto:${FROM_EMAIL}
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Site visit in 1 hour
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

/**
 * Generate HTML email template for new lead
 */
function generateNewLeadEmailHTML(lead, companyName) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Lead Notification</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header .emoji { font-size: 48px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .lead-card { background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #2563eb; }
        .lead-name { font-size: 22px; font-weight: bold; color: #1e40af; margin-bottom: 5px; }
        .lead-source { display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
        .detail-item { padding: 12px; background: white; border-radius: 6px; border: 1px solid #e2e8f0; }
        .detail-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
        .detail-value { font-size: 14px; color: #1e293b; font-weight: 500; }
        .detail-value a { color: #2563eb; text-decoration: none; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        .timestamp { color: #94a3b8; font-size: 12px; margin-top: 15px; }
        @media (max-width: 480px) { .details-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="emoji">🏠</div>
            <h1>New Lead Received!</h1>
        </div>
        <div class="content">
            <div class="lead-card">
                <div class="lead-name">${escapeHtml(lead.name)}</div>
                <span class="lead-source">Source: ${escapeHtml(lead.source || 'Website')}</span>
                
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">📧 Email</div>
                        <div class="detail-value">
                            <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email || 'Not provided')}</a>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📱 Phone</div>
                        <div class="detail-value">
                            <a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone || 'Not provided')}</a>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">🏢 Company</div>
                        <div class="detail-value">${escapeHtml(lead.company || 'Not provided')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">🏷️ Property Interest</div>
                        <div class="detail-value">${escapeHtml(lead.propertyInterest || 'Not specified')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">💰 Budget</div>
                        <div class="detail-value">${escapeHtml(lead.budget || 'Not specified')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📍 Preferred Location</div>
                        <div class="detail-value">${escapeHtml(lead.location || 'Not specified')}</div>
                    </div>
                </div>
                
                ${lead.notes ? `
                <div class="detail-item" style="margin-top: 15px; grid-column: span 2;">
                    <div class="detail-label">📝 Notes</div>
                    <div class="detail-value">${escapeHtml(lead.notes)}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="timestamp">Lead ID: ${escapeHtml(lead.id)} | Received: ${new Date(lead.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
        </div>
        <div class="footer">
            <p>This is an automated notification from ${escapeHtml(companyName)} Lead Management System</p>
            <p>© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML email template for status update
 */
function generateStatusUpdateEmailHTML(lead, statusChange, companyName) {
    const statusColors = {
        'New': '#3b82f6',
        'Call Attended': '#f59e0b',
        'No Response': '#6b7280',
        'Not Interested': '#ef4444',
        'Site Visit Booked': '#8b5cf6',
        'Site Visit Scheduled': '#6366f1',
        'Interested': '#10b981'
    };
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .status-change { display: flex; align-items: center; justify-content: center; gap: 20px; margin: 20px 0; }
        .status-badge { padding: 10px 20px; border-radius: 8px; font-weight: 600; color: white; }
        .arrow { font-size: 24px; color: #64748b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Lead Status Updated</h1>
        </div>
        <div class="content">
            <h2 style="margin-bottom: 5px;">${escapeHtml(lead.name)}</h2>
            <p style="color: #64748b; margin-top: 0;">${escapeHtml(lead.email)} | ${escapeHtml(lead.phone)}</p>
            
            <div class="status-change">
                <span class="status-badge" style="background: ${statusColors[statusChange.from] || '#64748b'}">
                    ${escapeHtml(statusChange.from)}
                </span>
                <span class="arrow">→</span>
                <span class="status-badge" style="background: ${statusColors[statusChange.to] || '#64748b'}">
                    ${escapeHtml(statusChange.to)}
                </span>
            </div>
        </div>
        <div class="footer">
            <p>Automated notification from ${escapeHtml(companyName)}</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML email for site visit (admin notification)
 */
function generateSiteVisitEmailHTML(lead, siteVisit, companyName) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .visit-card { background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .visit-date { font-size: 24px; font-weight: bold; color: #059669; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 Site Visit Scheduled</h1>
        </div>
        <div class="content">
            <h2>${escapeHtml(lead.name)}</h2>
            <p>${escapeHtml(lead.email)} | ${escapeHtml(lead.phone)}</p>
            
            <div class="visit-card">
                <div class="visit-date">📅 ${escapeHtml(siteVisit.date)} at ${escapeHtml(siteVisit.time)}</div>
                <p><strong>🏠 Property:</strong> ${escapeHtml(siteVisit.property)}</p>
                <p><strong>📍 Address:</strong> ${escapeHtml(siteVisit.address)}</p>
                <p><strong>👤 Agent:</strong> ${escapeHtml(siteVisit.agent)}</p>
            </div>
        </div>
        <div class="footer">
            <p>Automated notification from ${escapeHtml(companyName)}</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML email for site visit confirmation to CUSTOMER (with calendar invite support)
 */
function generateSiteVisitCustomerEmailHTML(lead, siteVisit, property, companyName) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .visit-card { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #10b981; border-radius: 12px; padding: 25px; margin: 20px 0; }
        .visit-date { font-size: 26px; font-weight: bold; color: #059669; margin-bottom: 10px; }
        .visit-time { font-size: 20px; color: #047857; margin-bottom: 15px; }
        .property-info { margin-top: 15px; padding-top: 15px; border-top: 1px solid #86efac; }
        .agent-card { background: white; border-radius: 8px; padding: 15px; margin-top: 15px; display: flex; align-items: center; gap: 12px; }
        .agent-avatar { width: 45px; height: 45px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
        .tips { background: #fef3c7; border-radius: 8px; padding: 15px; margin-top: 20px; border-left: 4px solid #f59e0b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="font-size: 48px; margin-bottom: 10px;">📅</div>
            <h1>Site Visit Confirmed!</h1>
        </div>
        <div class="content">
            <p style="font-size: 18px;">Dear <strong>${escapeHtml(lead.name)}</strong>,</p>
            <p>Thank you for your interest in ${escapeHtml(companyName)}! Your site visit has been confirmed.</p>
            
            <div class="visit-card">
                <div class="visit-date">📅 ${formatDate(siteVisit.scheduledAt)}</div>
                <div class="visit-time">🕐 ${formatTime(siteVisit.scheduledAt)}</div>
                
                <div class="property-info">
                    <div style="font-size: 18px; font-weight: 600; color: #1e293b;">🏠 ${escapeHtml(property?.name || 'Property Visit')}</div>
                    <div style="color: #64748b; margin-top: 5px;">📍 ${escapeHtml(property?.address || property?.location || 'Address will be shared')}</div>
                </div>
                
                <div class="agent-card">
                    <div class="agent-avatar">${(siteVisit.agentName || 'A').charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight: 600; color: #1e293b;">${escapeHtml(siteVisit.agentName || 'Our Representative')}</div>
                        <div style="font-size: 12px; color: #64748b;">Your Property Consultant</div>
                    </div>
                </div>
            </div>
            
            <div class="tips">
                <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">📝 What to Bring</div>
                <ul style="margin: 0; padding-left: 20px; color: #78350f;">
                    <li>Valid ID proof</li>
                    <li>Any questions you'd like to ask</li>
                    <li>Family members (if applicable)</li>
                </ul>
            </div>
            
            <p style="margin-top: 20px;">A calendar invite is attached. Please save this date!</p>
            
            <p style="margin-top: 20px;">
                <strong>Need to reschedule?</strong><br>
                Call us at: <a href="tel:${COMPANY_PHONE}" style="color: #2563eb;">${COMPANY_PHONE}</a>
            </p>
        </div>
        <div class="footer">
            <p><strong>${escapeHtml(companyName)}</strong></p>
            <p>📞 ${COMPANY_PHONE}</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML email for visit reminder
 */
function generateReminderEmailHTML(lead, siteVisit, property, reminderType, companyName) {
    const isToday = reminderType === 'TODAY';
    const headerColor = isToday ? '#ef4444, #dc2626' : '#f59e0b, #d97706';
    const badgeColor = isToday ? '#fef2f2' : '#fef3c7';
    const badgeTextColor = isToday ? '#dc2626' : '#92400e';
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, ${headerColor}); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .reminder-badge { display: inline-block; background: ${badgeColor}; color: ${badgeTextColor}; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-bottom: 20px; }
        .visit-card { background: #f8fafc; border-radius: 12px; padding: 25px; margin: 20px 0; border-left: 4px solid ${isToday ? '#ef4444' : '#f59e0b'}; }
        .visit-datetime { font-size: 22px; font-weight: bold; color: #1e293b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="font-size: 48px; margin-bottom: 10px;">${isToday ? '🔔' : '📅'}</div>
            <h1>${isToday ? 'Site Visit Today!' : 'Site Visit Tomorrow'}</h1>
        </div>
        <div class="content">
            <span class="reminder-badge">${isToday ? '⏰ TODAY' : '📆 TOMORROW'}</span>
            
            <p>Dear <strong>${escapeHtml(lead.name)}</strong>,</p>
            <p>${isToday ? 'This is a reminder that your site visit is scheduled for TODAY!' : 'This is a friendly reminder about your upcoming site visit tomorrow.'}</p>
            
            <div class="visit-card">
                <div class="visit-datetime">
                    📅 ${formatDate(siteVisit.scheduledAt)}<br>
                    🕐 ${formatTime(siteVisit.scheduledAt)}
                </div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                    <strong>🏠 ${escapeHtml(property?.name || 'Property Visit')}</strong><br>
                    📍 ${escapeHtml(property?.address || property?.location || 'Address shared earlier')}
                </div>
            </div>
            
            <p><strong>Your consultant:</strong> ${escapeHtml(siteVisit.agentName || 'Our representative')} will be waiting for you.</p>
            
            <p style="margin-top: 20px;">
                <strong>Need to reschedule?</strong><br>
                Please call us at <a href="tel:${COMPANY_PHONE}" style="color: #2563eb;">${COMPANY_PHONE}</a>
            </p>
        </div>
        <div class="footer">
            <p><strong>${escapeHtml(companyName)}</strong></p>
            <p>📞 ${COMPANY_PHONE}</p>
        </div>
    </div>
</body>
</html>`;
}

// ============================================
// EMAIL SENDING FUNCTIONS
// ============================================

/**
 * Send email with calendar attachment
 */
async function sendEmailWithCalendar(to, subject, htmlBody, icsContent) {
    const boundary = `----=_Part_${Date.now()}`;
    
    const rawEmail = [
        `From: ${COMPANY_NAME} <${FROM_EMAIL}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        htmlBody,
        '',
        `--${boundary}`,
        'Content-Type: text/calendar; charset=UTF-8; method=REQUEST',
        'Content-Transfer-Encoding: 7bit',
        'Content-Disposition: attachment; filename="site-visit.ics"',
        '',
        icsContent,
        '',
        `--${boundary}--`
    ].join('\r\n');
    
    const command = new SendRawEmailCommand({
        RawMessage: {
            Data: Buffer.from(rawEmail)
        }
    });
    
    return await sesClient.send(command);
}

// ============================================
// MAIN HANDLER
// ============================================

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    let body;
    try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || event;
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }
    
    const { type, to, subject, lead, statusChange, siteVisit, property, adminEmail, metadata } = body;
    const companyName = metadata?.companyName || COMPANY_NAME;
    
    // Validate required fields
    if (!type) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing required field: type' })
        };
    }
    
    if (!FROM_EMAIL) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'SES_FROM_EMAIL not configured' })
        };
    }
    
    // Generate email content based on type
    let htmlBody;
    let emailSubject = subject;
    
    try {
        switch (type) {
            case 'NEW_LEAD':
                if (!lead || !to) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing lead data or recipient' }) };
                }
                htmlBody = generateNewLeadEmailHTML(lead, companyName);
                emailSubject = subject || `🏠 New Lead: ${lead.name} - ${companyName}`;
                break;
            
            case 'LEAD_STATUS_UPDATE':
                if (!lead || !statusChange || !to) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required data' }) };
                }
                htmlBody = generateStatusUpdateEmailHTML(lead, statusChange, companyName);
                emailSubject = subject || `📊 Status Update: ${lead.name} - ${statusChange.to}`;
                break;
            
            // 📅 SITE VISIT SCHEDULED - Send to BOTH customer AND admin with calendar invite
            case 'SITE_VISIT_SCHEDULED':
            case 'SITE_VISIT_CUSTOMER': {
                if (!lead || !siteVisit) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing lead or siteVisit data' }) };
                }
                
                const results = [];
                
                // Send to Admin FIRST (more reliable - verified email)
                if (adminEmail || to) {
                    try {
                        const adminHtml = generateSiteVisitEmailHTML(lead, {
                            date: formatDate(siteVisit.scheduledAt),
                            time: formatTime(siteVisit.scheduledAt),
                            property: property?.name || 'Property',
                            address: property?.address || property?.location || '',
                            agent: siteVisit.agentName || 'TBD'
                        }, companyName);
                        
                        const adminCommand = new SendEmailCommand({
                            Source: `${companyName} <${FROM_EMAIL}>`,
                            Destination: { ToAddresses: [adminEmail || to] },
                            Message: {
                                Subject: { Data: `📅 New Site Visit: ${lead.name} - ${formatDate(siteVisit.scheduledAt)}`, Charset: 'UTF-8' },
                                Body: { Html: { Data: adminHtml, Charset: 'UTF-8' } }
                            }
                        });
                        const adminResult = await sesClient.send(adminCommand);
                        results.push({ recipient: 'admin', email: adminEmail || to, messageId: adminResult.MessageId });
                        console.log(`✅ Admin email sent to ${adminEmail || to}`);
                    } catch (adminError) {
                        console.error(`❌ Failed to send admin email:`, adminError.message);
                        results.push({ recipient: 'admin', email: adminEmail || to, error: adminError.message });
                    }
                }
                
                // Send to Customer with calendar invite (may fail if not verified in SES sandbox)
                if (lead.email) {
                    try {
                        const customerHtml = generateSiteVisitCustomerEmailHTML(lead, siteVisit, property, companyName);
                        const icsContent = generateICSCalendarInvite(lead, siteVisit, property, companyName);
                        const customerSubject = `📅 Site Visit Confirmed - ${formatDate(siteVisit.scheduledAt)} | ${companyName}`;
                        
                        const customerResult = await sendEmailWithCalendar(lead.email, customerSubject, customerHtml, icsContent);
                        results.push({ recipient: 'customer', email: lead.email, messageId: customerResult.MessageId });
                        console.log(`✅ Customer email sent to ${lead.email}`);
                    } catch (customerError) {
                        console.error(`❌ Failed to send customer email (may need SES verification):`, customerError.message);
                        results.push({ recipient: 'customer', email: lead.email, error: customerError.message });
                    }
                }
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, results })
                };
            }
            
            // 🔔 REMINDER - 1 DAY BEFORE
            case 'REMINDER_1_DAY': {
                if (!lead || !siteVisit) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required data' }) };
                }
                if (!lead.email) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'No customer email' }) };
                }
                
                htmlBody = generateReminderEmailHTML(lead, siteVisit, property, 'TOMORROW', companyName);
                emailSubject = `📅 Reminder: Site Visit Tomorrow | ${companyName}`;
                
                const command1Day = new SendEmailCommand({
                    Source: `${companyName} <${FROM_EMAIL}>`,
                    Destination: { ToAddresses: [lead.email] },
                    Message: {
                        Subject: { Data: emailSubject, Charset: 'UTF-8' },
                        Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } }
                    }
                });
                const result1Day = await sesClient.send(command1Day);
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, messageId: result1Day.MessageId })
                };
            }
            
            // 🔔 REMINDER - SAME DAY
            case 'REMINDER_TODAY': {
                if (!lead || !siteVisit) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required data' }) };
                }
                if (!lead.email) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'No customer email' }) };
                }
                
                htmlBody = generateReminderEmailHTML(lead, siteVisit, property, 'TODAY', companyName);
                emailSubject = `🔔 TODAY: Site Visit at ${formatTime(siteVisit.scheduledAt)} | ${companyName}`;
                
                const commandToday = new SendEmailCommand({
                    Source: `${companyName} <${FROM_EMAIL}>`,
                    Destination: { ToAddresses: [lead.email] },
                    Message: {
                        Subject: { Data: emailSubject, Charset: 'UTF-8' },
                        Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } }
                    }
                });
                const resultToday = await sesClient.send(commandToday);
                
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, messageId: resultToday.MessageId })
                };
            }
            
            case 'TEST':
                if (!to) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Missing recipient email' }) };
                }
                htmlBody = `<h1>✅ Email Service Test</h1><p>Your email notification service is working correctly!</p><p>Time: ${new Date().toISOString()}</p>`;
                emailSubject = subject || `🔧 Test Email - ${companyName}`;
                break;
            
            default:
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: `Unknown email type: ${type}` })
                };
        }
        
        // Send simple email (for NEW_LEAD, LEAD_STATUS_UPDATE, TEST)
        const command = new SendEmailCommand({
            Source: `${companyName} <${FROM_EMAIL}>`,
            Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
            Message: {
                Subject: { Data: emailSubject, Charset: 'UTF-8' },
                Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } }
            }
        });
        
        const result = await sesClient.send(command);
        console.log('Email sent successfully:', result.MessageId);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, messageId: result.MessageId })
        };
        
    } catch (error) {
        console.error('Failed to send email:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
