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
async function notifyOwnerOfNewAgent(ownerEmail, agentData) {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"Pulsar CRM" <${process.env.SMTP_USER}>`,
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
async function notifyAgentApproval(agentEmail, agentName) {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"Pulsar CRM" <${process.env.SMTP_USER}>`,
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
async function notifyAgentRejection(agentEmail, agentName, reason) {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"Pulsar CRM" <${process.env.SMTP_USER}>`,
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

module.exports = {
  notifyOwnerOfNewAgent,
  notifyAgentApproval,
  notifyAgentRejection,
  sendAgentCredentials,
  createOrgTransporter
};
