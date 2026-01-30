/**
 * Automation Workflow Engine
 * Executes automation workflows when triggers fire
 */

const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const Lead = require('../models/Lead');
const twilioService = require('../twilio/twilio.service');
const emailService = require('./email.service');
const elevenLabsService = require('./elevenLabs.service');

class WorkflowEngine {
  constructor() {
    this.isProcessing = false;
    this.processInterval = null;
  }

  /**
   * Start the job processor
   */
  start(intervalMs = 10000) {
    console.log('🚀 Workflow Engine started');
    this.processInterval = setInterval(() => this.processJobs(), intervalMs);
    // Process immediately on start
    this.processJobs();
  }

  /**
   * Stop the job processor
   */
  stop() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    console.log('🛑 Workflow Engine stopped');
  }

  /**
   * Trigger automations for a new lead
   */
  async triggerNewLead(lead) {
    try {
      console.log(`🔔 Triggering automations for new lead: ${lead.name}`);
      
      // Find all active automations with newLead trigger
      const automations = await Automation.find({
        triggerType: 'newLead',
        isActive: true
      });

      console.log(`Found ${automations.length} active automations for newLead trigger`);

      for (const automation of automations) {
        // Check if lead matches trigger conditions
        if (this.matchesTriggerConditions(lead, automation.triggerConditions)) {
          await this.startAutomation(automation, lead);
        }
      }
    } catch (error) {
      console.error('Error triggering new lead automations:', error);
    }
  }

  /**
   * Trigger automations for lead update
   */
  async triggerLeadUpdated(lead, changes) {
    try {
      const automations = await Automation.find({
        triggerType: 'leadUpdated',
        isActive: true
      });

      for (const automation of automations) {
        if (this.matchesTriggerConditions(lead, automation.triggerConditions)) {
          await this.startAutomation(automation, lead, { changes });
        }
      }
    } catch (error) {
      console.error('Error triggering lead updated automations:', error);
    }
  }

  /**
   * Trigger automations for site visit scheduled
   */
  async triggerSiteVisitScheduled(lead, siteVisit) {
    try {
      const automations = await Automation.find({
        triggerType: 'siteVisitScheduled',
        isActive: true
      });

      for (const automation of automations) {
        if (this.matchesTriggerConditions(lead, automation.triggerConditions)) {
          await this.startAutomation(automation, lead, { siteVisit });
        }
      }
    } catch (error) {
      console.error('Error triggering site visit automations:', error);
    }
  }

  /**
   * Check if a lead matches the automation's trigger conditions
   */
  matchesTriggerConditions(lead, conditions) {
    if (!conditions) return true;

    // Check lead source
    if (conditions.leadSource?.length > 0) {
      if (!conditions.leadSource.includes(lead.source)) {
        return false;
      }
    }

    // Check budget range
    if (conditions.minBudget && lead.budget < conditions.minBudget) {
      return false;
    }
    if (conditions.maxBudget && lead.budget > conditions.maxBudget) {
      return false;
    }

    // Check property types
    if (conditions.propertyTypes?.length > 0) {
      if (!conditions.propertyTypes.includes(lead.propertyType)) {
        return false;
      }
    }

    // Check locations
    if (conditions.locations?.length > 0) {
      const leadLocation = lead.location?.toLowerCase() || '';
      const matchesLocation = conditions.locations.some(loc => 
        leadLocation.includes(loc.toLowerCase())
      );
      if (!matchesLocation) {
        return false;
      }
    }

    return true;
  }

  /**
   * Start an automation run for a lead
   */
  async startAutomation(automation, lead, context = {}) {
    try {
      console.log(`▶️ Starting automation "${automation.name}" for lead "${lead.name}"`);

      // Create automation run
      const run = new AutomationRun({
        automation: automation._id,
        lead: lead._id,
        status: 'running',
        executionPath: []
      });
      await run.save();

      // Update automation stats
      automation.runsCount += 1;
      automation.lastRunAt = new Date();
      await automation.save();

      // Find trigger node and start execution
      const triggerNode = automation.getTriggerNode();
      if (!triggerNode) {
        throw new Error('No trigger node found in automation');
      }

      // Log trigger execution
      run.executionPath.push({
        nodeId: triggerNode.id,
        nodeType: triggerNode.type,
        nodeLabel: triggerNode.data.label,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        result: { triggered: true, context }
      });
      run.currentNodeId = triggerNode.id;
      await run.save();

      // Get next nodes after trigger and execute them
      const nextNodes = automation.getNextNodes(triggerNode.id);
      for (const { node, edge } of nextNodes) {
        await this.scheduleNode(run, automation, lead, node, edge);
      }

      return run;
    } catch (error) {
      console.error(`Error starting automation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Schedule a node for execution
   */
  async scheduleNode(run, automation, lead, node, edge, delay = 0) {
    const scheduledFor = new Date(Date.now() + delay);

    const job = new AutomationJob({
      automationRun: run._id,
      automation: automation._id,
      lead: lead._id,
      nodeId: node.id,
      nodeType: node.type,
      nodeData: node.data,
      scheduledFor,
      status: 'pending'
    });
    await job.save();

    console.log(`📅 Scheduled node "${node.data.label}" for ${scheduledFor.toISOString()}`);
    return job;
  }

  /**
   * Process pending jobs
   */
  async processJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find jobs that are due
      const jobs = await AutomationJob.find({
        status: 'pending',
        scheduledFor: { $lte: new Date() }
      })
        .sort({ scheduledFor: 1 })
        .limit(10)
        .populate('lead')
        .populate('automation');

      for (const job of jobs) {
        await this.executeJob(job);
      }
    } catch (error) {
      console.error('Error processing jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single job
   */
  async executeJob(job) {
    try {
      console.log(`⚙️ Executing job: ${job.nodeData?.label || job.nodeId}`);

      job.status = 'processing';
      job.attempts += 1;
      job.lastAttemptAt = new Date();
      await job.save();

      // Get the run and automation
      const run = await AutomationRun.findById(job.automationRun);
      const automation = await Automation.findById(job.automation);
      const lead = await Lead.findById(job.lead);

      if (!run || !automation || !lead) {
        throw new Error('Missing run, automation, or lead');
      }

      // Add to execution path
      const pathEntry = {
        nodeId: job.nodeId,
        nodeType: job.nodeType,
        nodeLabel: job.nodeData?.label,
        status: 'running',
        startedAt: new Date()
      };
      run.executionPath.push(pathEntry);
      run.currentNodeId = job.nodeId;
      await run.save();

      // Execute based on node type
      let result;
      let nextHandle = null; // For condition nodes

      switch (job.nodeData?.type) {
        case 'whatsapp':
          result = await this.executeWhatsApp(lead, job.nodeData.config);
          break;
        case 'aiCall':
          result = await this.executeAICall(lead, job.nodeData.config);
          break;
        case 'humanCall':
          result = await this.executeHumanCall(lead, job.nodeData.config);
          break;
        case 'email':
          result = await this.executeEmail(lead, job.nodeData.config);
          break;
        case 'condition':
        case 'conditionTimeout':
          result = await this.evaluateCondition(lead, job.nodeData.config);
          nextHandle = result.passed ? 'yes' : 'no';
          break;
        case 'delay':
        case 'wait':
          result = { delayed: true };
          break;
        default:
          result = { skipped: true, reason: 'Unknown node type' };
      }

      // Update execution path
      const pathIndex = run.executionPath.length - 1;
      run.executionPath[pathIndex].status = 'completed';
      run.executionPath[pathIndex].completedAt = new Date();
      run.executionPath[pathIndex].result = result;
      await run.save();

      // Mark job as completed
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
      await job.save();

      // Schedule next nodes
      const nextNodes = automation.getNextNodes(job.nodeId, nextHandle);
      
      if (nextNodes.length === 0) {
        // No more nodes - check if automation is complete
        const pendingJobs = await AutomationJob.countDocuments({
          automationRun: run._id,
          status: { $in: ['pending', 'processing'] }
        });
        
        if (pendingJobs === 0) {
          run.status = 'completed';
          run.completedAt = new Date();
          await run.save();
          
          automation.successCount += 1;
          await automation.save();
          
          console.log(`✅ Automation run completed: ${automation.name}`);
        }
      } else {
        for (const { node, edge } of nextNodes) {
          // Calculate delay if it's a delay node
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
      }

    } catch (error) {
      console.error(`❌ Job execution failed: ${error.message}`);
      
      job.lastError = error.message;
      
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        
        // Update run status
        const run = await AutomationRun.findById(job.automationRun);
        if (run) {
          const pathIndex = run.executionPath.findIndex(p => p.nodeId === job.nodeId && p.status === 'running');
          if (pathIndex >= 0) {
            run.executionPath[pathIndex].status = 'failed';
            run.executionPath[pathIndex].error = error.message;
          }
          run.status = 'failed';
          run.error = error.message;
          await run.save();
          
          const automation = await Automation.findById(job.automation);
          if (automation) {
            automation.failureCount += 1;
            await automation.save();
          }
        }
      } else {
        // Retry later
        job.status = 'pending';
        job.scheduledFor = new Date(Date.now() + 60000 * job.attempts); // Exponential backoff
      }
      
      await job.save();
    }
  }

  /**
   * Calculate delay in milliseconds
   */
  calculateDelay(config) {
    const duration = config?.duration || 1;
    const unit = config?.unit || 'minutes';
    
    const multipliers = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000
    };
    
    const delayMs = duration * (multipliers[unit] || multipliers.minutes);
    console.log(`⏱️ Calculated delay: ${duration} ${unit} = ${delayMs}ms`);
    return delayMs;
  }

  /**
   * Execute WhatsApp action
   */
  async executeWhatsApp(lead, config, context = {}) {
    try {
      console.log(`📱 Executing WhatsApp action for lead ${lead.name}`);
      
      if (!lead.phone) {
        console.warn(`No phone number for lead ${lead.name}`);
        return { success: false, error: 'No phone number' };
      }
      
      // Get user's WhatsApp settings
      const userId = context.userId || lead.assignedTo;
      if (!userId) {
        console.warn('No user ID available for WhatsApp settings');
        // Fallback to Twilio WhatsApp if available
        const message = this.interpolateTemplate(config?.message || 'Hello {{name}}!', lead);
        const result = await twilioService.sendWhatsApp(lead.phone, message);
        return { success: true, messageId: result.sid, method: 'twilio' };
      }
      
      const Settings = require('../models/settings.model');
      const settings = await Settings.findOne({ userId });
      
      if (!settings || !settings.whatsapp || !settings.whatsapp.enabled) {
        console.warn('WhatsApp not configured for user, using Twilio fallback');
        // Fallback to Twilio WhatsApp if available
        const message = this.interpolateTemplate(config?.message || 'Hello {{name}}!', lead);
        const result = await twilioService.sendWhatsApp(lead.phone, message);
        return { success: true, messageId: result.sid, method: 'twilio' };
      }
      
      // Use Meta WhatsApp API with user's credentials
      const whatsappService = require('./whatsapp.service');
      
      if (config.template) {
        // Send template message
        const result = await whatsappService.sendTemplateMessage(
          lead.phone,
          config.template,
          config.languageCode || 'en',
          config.components,
          settings.whatsapp.accessToken
        );
        
        console.log(`✅ WhatsApp template sent to ${lead.name}: ${result.messageId}`);
        return { success: true, messageId: result.messageId, method: 'meta' };
      } else {
        // Send text message
        const message = this.interpolateTemplate(config?.message || 'Hello {{name}}!', lead);
        const result = await whatsappService.sendTextMessage(
          lead.phone,
          message,
          settings.whatsapp.accessToken
        );
        
        console.log(`✅ WhatsApp text sent to ${lead.name}: ${result.messageId}`);
        return { success: true, messageId: result.messageId, method: 'meta' };
      }
    } catch (error) {
      console.error('WhatsApp execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute AI Call action
   */
  async executeAICall(lead, config) {
    try {
      if (!lead.phone) {
        return { success: false, error: 'Lead has no phone number' };
      }

      // Use ElevenLabs service for AI call
      const result = await elevenLabsService.makeCall(lead.phone, {
        script: config?.script,
        voiceId: config?.voiceId,
        leadName: lead.name,
        leadData: lead
      });

      return {
        success: true,
        callId: result?.callId,
        status: result?.status
      };
    } catch (error) {
      console.error('AI Call execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute Human Call action (creates a task for agent)
   */
  async executeHumanCall(lead, config) {
    try {
      // Create an activity/task for the assigned agent
      const Activity = require('../models/Activity');
      
      const activity = new Activity({
        lead: lead._id,
        type: 'call_scheduled',
        title: `Call lead: ${lead.name}`,
        description: config?.notes || 'Automated call task from workflow',
        assignedTo: lead.assignedAgent,
        dueDate: new Date(),
        priority: 'high',
        status: 'pending'
      });
      await activity.save();

      return {
        success: true,
        activityId: activity._id,
        message: 'Call task created for agent'
      };
    } catch (error) {
      console.error('Human Call execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute Email action
   */
  async executeEmail(lead, config) {
    try {
      if (!lead.email) {
        return { success: false, error: 'Lead has no email address' };
      }

      const subject = this.interpolateTemplate(config?.subject || 'Hello from JK Construction', lead);
      const body = this.interpolateTemplate(config?.body || 'Hi {{name}}, thank you for your interest!', lead);

      await emailService.sendEmail({
        to: lead.email,
        subject,
        html: body
      });

      return {
        success: true,
        to: lead.email,
        subject
      };
    } catch (error) {
      console.error('Email execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Evaluate a condition node
   */
  async evaluateCondition(lead, config) {
    try {
      const field = config?.field;
      const operator = config?.operator;
      const value = config?.value;

      console.log(`🔍 Evaluating condition: ${field} ${operator} ${value}`);

      if (!field) {
        return { passed: true, reason: 'No condition specified' };
      }

      // Get the field value from lead - handle special computed fields
      let fieldValue;
      
      switch (field) {
        case 'status':
          fieldValue = lead.status;
          break;
        case 'callStatus':
          fieldValue = lead.callStatus || lead.lastCallStatus || 'not_called';
          break;
        case 'whatsappStatus':
          fieldValue = lead.whatsappStatus || lead.lastWhatsappStatus || 'not_sent';
          break;
        case 'budget':
          fieldValue = lead.budget;
          break;
        case 'source':
          fieldValue = lead.source;
          break;
        case 'propertyType':
          fieldValue = lead.propertyType;
          break;
        case 'location':
          fieldValue = lead.location || lead.preferredLocation;
          break;
        case 'callAttempts':
          fieldValue = lead.callAttempts || 0;
          break;
        case 'lastContactDays':
          // Calculate days since last contact
          if (lead.lastContactAt) {
            const daysDiff = Math.floor((Date.now() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24));
            fieldValue = daysDiff;
          } else {
            fieldValue = 999; // No contact yet
          }
          break;
        case 'responseTime':
          // Hours since lead was created without response
          if (lead.firstResponseAt) {
            const hoursDiff = Math.floor((new Date(lead.firstResponseAt).getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60));
            fieldValue = hoursDiff;
          } else {
            fieldValue = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60));
          }
          break;
        case 'hasAgent':
          fieldValue = !!(lead.assignedAgent || lead.assignedTo);
          break;
        case 'hasSiteVisit':
          fieldValue = !!(lead.siteVisitScheduled || lead.siteVisitDate);
          break;
        default:
          fieldValue = this.getNestedValue(lead, field);
      }

      console.log(`   Field "${field}" = "${fieldValue}"`);

      let passed = false;
      switch (operator) {
        case 'equals':
          passed = String(fieldValue).toLowerCase() === String(value).toLowerCase();
          break;
        case 'notEquals':
          passed = String(fieldValue).toLowerCase() !== String(value).toLowerCase();
          break;
        case 'contains':
          passed = String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
          break;
        case 'greaterThan':
          passed = Number(fieldValue) > Number(value);
          break;
        case 'lessThan':
          passed = Number(fieldValue) < Number(value);
          break;
        case 'isEmpty':
          passed = !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined;
          break;
        case 'isNotEmpty':
          passed = fieldValue && fieldValue !== '' && fieldValue !== null && fieldValue !== undefined;
          break;
        case 'isTrue':
          passed = fieldValue === true || fieldValue === 'true' || fieldValue === 1;
          break;
        case 'isFalse':
          passed = fieldValue === false || fieldValue === 'false' || fieldValue === 0 || !fieldValue;
          break;
        default:
          passed = true;
      }

      console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);

      return {
        passed,
        field,
        operator,
        expectedValue: value,
        actualValue: fieldValue
      };
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return { passed: false, error: error.message };
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Interpolate template variables
   */
  interpolateTemplate(template, lead) {
    return template
      .replace(/\{\{name\}\}/g, lead.name || '')
      .replace(/\{\{firstName\}\}/g, (lead.name || '').split(' ')[0])
      .replace(/\{\{email\}\}/g, lead.email || '')
      .replace(/\{\{phone\}\}/g, lead.phone || '')
      .replace(/\{\{budget\}\}/g, lead.budget ? `₹${lead.budget.toLocaleString()}` : '')
      .replace(/\{\{propertyType\}\}/g, lead.propertyType || '')
      .replace(/\{\{location\}\}/g, lead.location || '')
      .replace(/\{\{source\}\}/g, lead.source || '');
  }

  /**
   * Manually trigger an automation for a lead
   */
  async manualTrigger(automationId, leadId, userId) {
    const automation = await Automation.findById(automationId);
    const lead = await Lead.findById(leadId);

    if (!automation) throw new Error('Automation not found');
    if (!lead) throw new Error('Lead not found');

    return this.startAutomation(automation, lead, { 
      triggeredBy: 'manual',
      userId 
    });
  }
}

// Singleton instance
const workflowEngine = new WorkflowEngine();

module.exports = workflowEngine;
