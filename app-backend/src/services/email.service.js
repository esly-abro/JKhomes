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
    from: `"LeadFlow CRM" <${process.env.SMTP_USER}>`,
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
            <p>A new agent has signed up for LeadFlow CRM and is awaiting your approval.</p>
            
            <div class="agent-info">
              <p><strong>📧 Email:</strong> ${agentData.email}</p>
              <p><strong>👤 Name:</strong> ${agentData.name}</p>
              <p><strong>📱 Phone:</strong> ${agentData.phone || 'Not provided'}</p>
              <p><strong>🕐 Signed up:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <p>Please log in to LeadFlow CRM to review and approve or reject this registration.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/users" class="button">
                Review Agent
              </a>
            </div>
            
            <div class="footer">
              <p>This is an automated message from LeadFlow CRM</p>
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
    from: `"LeadFlow CRM" <${process.env.SMTP_USER}>`,
    to: agentEmail,
    subject: '✅ Your LeadFlow CRM Account Has Been Approved',
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
            <h1>🎉 Welcome to LeadFlow CRM!</h1>
          </div>
          <div class="content">
            <p>Hi ${agentName},</p>
            <p>Great news! Your LeadFlow CRM account has been approved.</p>
            <p>You can now log in and start managing your assigned leads.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">
                Log In Now
              </a>
            </div>
            
            <p>If you have any questions, please contact your team manager.</p>
            
            <div class="footer">
              <p>This is an automated message from LeadFlow CRM</p>
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
    from: `"LeadFlow CRM" <${process.env.SMTP_USER}>`,
    to: agentEmail,
    subject: 'LeadFlow CRM Account Update',
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
            <p>We wanted to inform you that your LeadFlow CRM registration was not approved at this time.</p>
            
            ${reason ? `
            <div class="reason-box">
              <p><strong>Reason:</strong></p>
              <p>${reason}</p>
            </div>
            ` : ''}
            
            <p>If you believe this is a mistake or have questions, please contact the team administrator.</p>
            
            <div class="footer">
              <p>This is an automated message from LeadFlow CRM</p>
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

module.exports = {
  notifyOwnerOfNewAgent,
  notifyAgentApproval,
  notifyAgentRejection
};
