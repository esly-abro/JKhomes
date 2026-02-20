/**
 * Email Service
 * Handles all email notifications using Nodemailer
 */

const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  // If no SMTP config, log warning and use test account
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  No SMTP credentials configured. Emails will be logged to console only.');
    return null;
  }

  return nodemailer.createTransporter(config);
};

/**
 * Send email to owner when new agent signs up
 */
async function notifyOwnerOfNewAgent(ownerEmail, agentData, organizationId) {
  const { transporter, fromAddress } = await createOrgTransporter(organizationId);
  
  const mailOptions = {
    from: fromAddress || `"Pulsar CRM" <${process.env.SMTP_USER}>`,
    to: ownerEmail,
    subject: '🔔 New Agent Signup Pending Approval',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .agent-info { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
          .agent-info p { margin: 8px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🆕 New Agent Registration</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>A new agent has signed up for Pulsar CRM and is awaiting your approval.</p>
            
            <div class="agent-info">
              <p><strong>📧 Email:</strong> ${agentData.email}</p>
              <p><strong>👤 Name:</strong> ${agentData.name}</p>
              <p><strong>📱 Phone:</strong> ${agentData.phone || 'Not provided'}</p>
              <p><strong>🕐 Signed up:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p>Please log in to Pulsar CRM to review and approve or reject this registration.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/users" class="button">
                Review Agent
              </a>
            </div>
            
            <div class="footer">
              <p>This is an automated message from Pulsar CRM</p>
              <p>If you didn't expect this email, please contact support</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Would send to:', ownerEmail);
    console.log('Subject:', mailOptions.subject);
    console.log('Agent:', agentData);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to owner:', ownerEmail, '| Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    throw error;
  }
}

/**
 * Send approval notification to agent
 */
async function notifyAgentApproval(agentEmail, agentName, organizationId) {
  const { transporter, fromAddress } = await createOrgTransporter(organizationId);
  
  const mailOptions = {
    from: fromAddress || `"Pulsar CRM" <${process.env.SMTP_USER}>`,
    to: agentEmail,
    subject: '✅ Your Pulsar CRM Account Has Been Approved',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Pulsar CRM!</h1>
          </div>
          <div class="content">
            <p>Hi ${agentName},</p>
            <p>Great news! Your Pulsar CRM account has been approved.</p>
            <p>You can now log in and start managing your assigned leads.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">
                Log In Now
              </a>
            </div>
            
            <p>If you have any questions, please contact your team manager.</p>
            
            <div class="footer">
              <p>This is an automated message from Pulsar CRM</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Would send approval to:', agentEmail);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Approval email sent to:', agentEmail);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send approval email:', error.message);
    throw error;
  }
}

/**
 * Send rejection notification to agent
 */
async function notifyAgentRejection(agentEmail, agentName, reason, organizationId) {
  const { transporter, fromAddress } = await createOrgTransporter(organizationId);
  
  const mailOptions = {
    from: fromAddress || `"Pulsar CRM" <${process.env.SMTP_USER}>`,
    to: agentEmail,
    subject: 'Pulsar CRM Account Update',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .reason-box { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Registration Update</h1>
          </div>
          <div class="content">
            <p>Hi ${agentName},</p>
            <p>We wanted to inform you that your Pulsar CRM registration was not approved at this time.</p>
            
            ${reason ? `
            <div class="reason-box">
              <p><strong>Reason:</strong></p>
              <p>${reason}</p>
            </div>
            ` : ''}
            
            <p>If you believe this is a mistake or have questions, please contact the team administrator.</p>
            
            <div class="footer">
              <p>This is an automated message from Pulsar CRM</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Would send rejection to:', agentEmail);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Rejection email sent to:', agentEmail);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error.message);
    throw error;
  }
}

/**
 * Create a transporter using organization's SMTP settings (from DB)
 * Falls back to global .env SMTP if org has no config
 */
async function createOrgTransporter(organizationId) {
  if (organizationId) {
    try {
      const Organization = require('../models/organization.model');
      const org = await Organization.findById(organizationId);
      if (org?.smtp?.isConfigured && org.smtp.user && org.smtp.pass) {
        console.log(`📧 Using org SMTP: ${org.smtp.user}`);
        return {
          transporter: nodemailer.createTransport({
            host: org.smtp.host,
            port: org.smtp.port || 587,
            secure: org.smtp.secure || false,
            auth: { user: org.smtp.user, pass: org.smtp.pass }
          }),
          fromAddress: `"${org.smtp.fromName || org.name || 'Pulsar CRM'}" <${org.smtp.user}>`,
          orgName: org.name
        };
      }
    } catch (err) {
      console.error('Failed to load org SMTP config, falling back to global:', err.message);
    }
  }

  // Fallback to global .env SMTP
  const transporter = createTransporter();
  const companyName = process.env.COMPANY_NAME || 'Pulsar CRM';
  return {
    transporter,
    fromAddress: transporter ? `"${companyName}" <${process.env.SMTP_USER}>` : null,
    orgName: companyName
  };
}

/**
 * Send login credentials to agent when created by owner
 */
async function sendAgentCredentials(agentEmail, agentName, password, ownerName, organizationId) {
  const { transporter, fromAddress, orgName } = await createOrgTransporter(organizationId);
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const companyName = orgName || process.env.COMPANY_NAME || 'Pulsar CRM';

  const mailOptions = {
    from: fromAddress || `"${companyName}" <noreply@pulsar.com>`,
    to: agentEmail,
    subject: `🎉 Your ${companyName} Account Has Been Created`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
          .credentials p { margin: 8px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin: 15px 0; font-size: 13px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${companyName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${agentName},</p>
            <p>${ownerName || 'Your manager'} has created an account for you. Here are your login credentials:</p>
            
            <div class="credentials">
              <p><strong>📧 Email:</strong> ${agentEmail}</p>
              <p><strong>🔑 Password:</strong> ${password}</p>
            </div>
            
            <div class="warning">
              ⚠️ <strong>Important:</strong> Please change your password after your first login for security.
            </div>
            
            <div style="text-align: center;">
              <a href="${loginUrl}/login" class="button">
                Log In Now
              </a>
            </div>
            
            <p>If you have any questions, please contact your team manager.</p>
            
            <div class="footer">
              <p>This is an automated message from ${companyName}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Would send credentials to:', agentEmail);
    console.log('Subject:', mailOptions.subject);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Credentials email sent to:', agentEmail, '| Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send credentials email:', error.message);
    throw error;
  }
}

/**
 * Generic send email using org SMTP
 * Used by workflow executors (humanCall), etc.
 */
async function sendEmail({ to, subject, html, organizationId }) {
  const { transporter, fromAddress } = await createOrgTransporter(organizationId);

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Would send to:', to);
    console.log('Subject:', subject);
    return { success: true, preview: true };
  }

  const mailOptions = { from: fromAddress, to, subject, html };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to:', to, '| Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send email to', to, ':', error.message);
    throw error;
  }
}

/**
 * Notify agent that new leads have been assigned to them
 * @param {string} agentEmail
 * @param {string} agentName
 * @param {Array} leads - array of { name, phone, status, source }
 * @param {string} assignedByName - who assigned
 * @param {string} organizationId
 */
async function sendLeadAssignmentEmail(agentEmail, agentName, leads, assignedByName, organizationId) {
  const { transporter, fromAddress, orgName } = await createOrgTransporter(organizationId);
  const count = leads.length;
  const companyName = orgName || 'Pulsar CRM';
  const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const leadRows = leads.slice(0, 10).map(l => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${l.name || 'N/A'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${l.phone || 'N/A'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${l.status || 'New'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${l.source || 'N/A'}</td>
    </tr>
  `).join('');

  const moreText = count > 10 ? `<p style="color:#6b7280; font-size:13px;">...and ${count - 10} more lead(s). View all in your dashboard.</p>` : '';

  const mailOptions = {
    from: fromAddress || `"${companyName}" <noreply@pulsar.com>`,
    to: agentEmail,
    subject: `📋 ${count} New Lead${count > 1 ? 's' : ''} Assigned to You`,
    html: `
      <!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; margin: 16px 0; }
        th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 13px; color: #374151; }
        .button { display: inline-block; padding: 12px 28px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; }
      </style></head><body>
        <div class="container">
          <div class="header">
            <h2 style="margin:0;">📋 New Leads Assigned</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${agentName}</strong>,</p>
            <p><strong>${assignedByName || 'Your manager'}</strong> has assigned <strong>${count} new lead${count > 1 ? 's' : ''}</strong> to you.</p>
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>${leadRows}</tbody>
            </table>
            ${moreText}
            <div style="text-align:center;">
              <a href="${dashboardUrl}/leads" class="button">View My Leads</a>
            </div>
            <div class="footer"><p>This is an automated message from ${companyName}</p></div>
          </div>
        </div>
      </body></html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Lead assignment email to:', agentEmail, `(${count} leads)`);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Lead assignment email sent to ${agentEmail} (${count} leads) | ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send lead assignment email:', error.message);
    // Don't throw — non-blocking
  }
}

/**
 * Notify agent that a task has been assigned to them
 * @param {string} agentEmail
 * @param {string} agentName
 * @param {object} task - { title, type, priority, dueDate, description }
 * @param {object} lead - { name, phone, email, status }
 * @param {string} assignedByName
 * @param {string} organizationId
 */
async function sendTaskAssignmentEmail(agentEmail, agentName, task, lead, assignedByName, organizationId) {
  const { transporter, fromAddress, orgName } = await createOrgTransporter(organizationId);
  const companyName = orgName || 'Pulsar CRM';
  const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const priorityColors = { urgent: '#dc2626', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  const pColor = priorityColors[task.priority] || '#6b7280';
  const dueStr = task.dueDate ? new Date(task.dueDate).toLocaleString() : 'No due date';

  const mailOptions = {
    from: fromAddress || `"${companyName}" <noreply@pulsar.com>`,
    to: agentEmail,
    subject: `🔔 New Task: ${task.title || 'Task Assigned'}`,
    html: `
      <!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #fff7ed; padding: 24px; border: 1px solid #fed7aa; border-radius: 0 0 8px 8px; }
        .card { background: white; border: 1px solid #fdba74; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
        .button { display: inline-block; padding: 12px 28px; background: #f97316; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; }
      </style></head><body>
        <div class="container">
          <div class="header">
            <h2 style="margin:0;">📋 New Task Assigned</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${agentName}</strong>,</p>
            <p>${assignedByName ? `<strong>${assignedByName}</strong> has assigned` : 'A new task has been assigned'} to you.</p>
            <div class="card">
              <h3 style="margin-top:0; color:#c2410c;">${task.title || 'Task'}</h3>
              ${task.description ? `<p style="color:#666;">${task.description}</p>` : ''}
              <p><span class="badge" style="background:${pColor};">${(task.priority || 'medium').toUpperCase()}</span> &nbsp; 📅 Due: ${dueStr}</p>
            </div>
            ${lead ? `
            <div class="card">
              <h4 style="margin-top:0; color:#c2410c;">Lead Details</h4>
              <table style="width:100%; border-collapse:collapse;">
                <tr><td style="padding:4px 8px; color:#666;"><strong>Name:</strong></td><td style="padding:4px 8px;">${lead.name || 'N/A'}</td></tr>
                <tr><td style="padding:4px 8px; color:#666;"><strong>Phone:</strong></td><td style="padding:4px 8px;"><a href="tel:${lead.phone}">${lead.phone || 'N/A'}</a></td></tr>
                <tr><td style="padding:4px 8px; color:#666;"><strong>Email:</strong></td><td style="padding:4px 8px;">${lead.email || 'N/A'}</td></tr>
                <tr><td style="padding:4px 8px; color:#666;"><strong>Status:</strong></td><td style="padding:4px 8px;">${lead.status || 'N/A'}</td></tr>
              </table>
            </div>` : ''}
            <div style="text-align:center;">
              <a href="${dashboardUrl}/tasks" class="button">View My Tasks</a>
            </div>
            <div class="footer"><p>This is an automated message from ${companyName}</p></div>
          </div>
        </div>
      </body></html>
    `
  };

  if (!transporter) {
    console.log('📧 [EMAIL PREVIEW] Task assignment email to:', agentEmail);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Task assignment email sent to ${agentEmail} | ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send task assignment email:', error.message);
  }
}

/**
 * Notify agent when their lead status changes to a high-priority status
 * @param {string} agentEmail
 * @param {string} agentName
 * @param {object} lead - { name, phone, email, status }
 * @param {string} newStatus
 * @param {string} organizationId
 */
async function sendHighPriorityStatusEmail(agentEmail, agentName, lead, newStatus, organizationId) {
  const { transporter, fromAddress, orgName } = await createOrgTransporter(organizationId);
  const companyName = orgName || 'Pulsar CRM';
  const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const statusMessages = {
    'Appointment Booked': { icon: '📅', action: 'An appointment has been booked', color: '#3b82f6' },
    'Appointment Scheduled': { icon: '🗓️', action: 'An appointment has been scheduled', color: '#8b5cf6' },
    'Interested': { icon: '🔥', action: 'Lead is now marked as Interested', color: '#22c55e' },
  };

  const info_s = statusMessages[newStatus] || { icon: '⚡', action: `Status changed to ${newStatus}`, color: '#f97316' };

  const mailOptions = {
    from: fromAddress || `"${companyName}" <noreply@pulsar.com>`,
    to: agentEmail,
    subject: `${info_s.icon} High Priority: ${lead.name || 'Lead'} — ${newStatus}`,
    html: `
      <!DOCTYPE html><html><head><style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, ${info_s.color} 0%, ${info_s.color}dd 100%); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .card { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .status-badge { display: inline-block; padding: 6px 14px; border-radius: 16px; font-size: 14px; font-weight: 600; color: white; background: ${info_s.color}; }
        .button { display: inline-block; padding: 12px 28px; background: ${info_s.color}; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; }
      </style></head><body>
        <div class="container">
          <div class="header">
            <h2 style="margin:0;">${info_s.icon} High Priority Update</h2>
          </div>
          <div class="content">
            <p>Hi <strong>${agentName}</strong>,</p>
            <p>${info_s.action} for your lead <strong>${lead.name || 'N/A'}</strong>.</p>
            <p>New status: <span class="status-badge">${newStatus}</span></p>
            <div class="card">
              <h4 style="margin-top:0;">Lead Details</h4>
              <table style="width:100%; border-collapse:collapse;">
                <tr><td style="padding:4px 8px; color:#666;"><strong>Name:</strong></td><td style="padding:4px 8px;">${lead.name || 'N/A'}</td></tr>
                <tr><td style="padding:4px 8px; color:#666;"><strong>Phone:</strong></td><td style="padding:4px 8px;"><a href="tel:${lead.phone}">${lead.phone || 'N/A'}</a></td></tr>
                <tr><td style="padding:4px 8px; color:#666;"><strong>Email:</strong></td><td style="padding:4px 8px;">${lead.email || 'N/A'}</td></tr>
              </table>
            </div>
            <div style="text-align:center;">
              <a href="${dashboardUrl}/leads" class="button">View Lead</a>
            </div>
            <p style="color:#666; font-size:14px;">Please take immediate action on this lead.</p>
            <div class="footer"><p>This is an automated message from ${companyName}</p></div>
          </div>
        </div>
      </body></html>
    `
  };

  if (!transporter) {
    console.log(`📧 [EMAIL PREVIEW] High-priority status email to: ${agentEmail} (${newStatus})`);
    return { success: true, preview: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ High-priority status email sent to ${agentEmail} (${newStatus}) | ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send high-priority status email:', error.message);
  }
}

module.exports = {
  notifyOwnerOfNewAgent,
  notifyAgentApproval,
  notifyAgentRejection,
  sendAgentCredentials,
  createOrgTransporter,
  sendEmail,
  sendLeadAssignmentEmail,
  sendTaskAssignmentEmail,
  sendHighPriorityStatusEmail
};
