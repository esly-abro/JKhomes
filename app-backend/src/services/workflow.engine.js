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

      // ===== DUPLICATE PREVENTION =====
      // Check if this automation is already running for this lead
      if (automation.preventDuplicates) {
        const activeRun = await AutomationRun.findOne({
          automation: automation._id,
          lead: lead._id,
          status: { $in: ['running', 'paused', 'waiting_for_response'] }
        });

        if (activeRun) {
          console.log(`⚠️ Automation "${automation.name}" already running for lead "${lead.name}" (Run ID: ${activeRun._id}), skipping`);
          return { skipped: true, reason: 'already_running', existingRunId: activeRun._id };
        }
      }

      // Check if "run once per lead" is enabled
      if (automation.runOncePerLead) {
        const previousRun = await AutomationRun.findOne({
          automation: automation._id,
          lead: lead._id,
          status: 'completed'
        });

        if (previousRun) {
          console.log(`⚠️ Automation "${automation.name}" already completed for lead "${lead.name}" (run once mode), skipping`);
          return { skipped: true, reason: 'run_once_completed', previousRunId: previousRun._id };
        }
      }

      // Check cooldown period
      if (automation.cooldownPeriod > 0) {
        const cooldownTime = new Date(Date.now() - automation.cooldownPeriod * 60 * 1000);
        const recentRun = await AutomationRun.findOne({
          automation: automation._id,
          lead: lead._id,
          createdAt: { $gte: cooldownTime }
        });

        if (recentRun) {
          const minutesAgo = Math.round((Date.now() - recentRun.createdAt.getTime()) / 60000);
          console.log(`⚠️ Automation "${automation.name}" ran ${minutesAgo} minutes ago for lead "${lead.name}" (cooldown: ${automation.cooldownPeriod} min), skipping`);
          return { skipped: true, reason: 'cooldown_active', minutesSinceLastRun: minutesAgo };
        }
      }
      // ===== END DUPLICATE PREVENTION =====

      // Create automation run
      const run = new AutomationRun({
        automation: automation._id,
        lead: lead._id,
        status: 'running',
        executionPath: [],
        context: context  // Store trigger context
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
   * Process pending jobs and check for timeouts
   */
  async processJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // First, check for any timed-out waiting automations (WhatsApp responses)
      await this.processWaitingTimeouts();
      
      // Also check for timed-out AI call responses
      await this.processCallTimeouts();
      
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
   * Process automations that are waiting for response but have timed out
   */
  async processWaitingTimeouts() {
    try {
      // Find all runs that have timed out
      const timedOutRuns = await AutomationRun.find({
        status: 'waiting_for_response',
        'waitingForResponse.isWaiting': true,
        'waitingForResponse.timeoutAt': { $lte: new Date() }
      }).populate('lead').populate('automation');
      
      if (timedOutRuns.length > 0) {
        console.log(`⏰ Found ${timedOutRuns.length} timed out automation runs`);
      }
      
      for (const run of timedOutRuns) {
        await this.resumeFromTimeout(run);
      }
    } catch (error) {
      console.error('Error processing waiting timeouts:', error);
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
      let shouldWaitForResponse = false; // For waitForResponse nodes

      switch (job.nodeData?.type) {
        case 'whatsapp':
          result = await this.executeWhatsApp(lead, job.nodeData.config, run);
          break;
        case 'whatsappWithResponse':
          // WhatsApp message that waits for response
          result = await this.executeWhatsAppWithResponse(lead, job.nodeData.config, run, automation, job);
          shouldWaitForResponse = true;
          break;
        case 'waitForResponse':
          // Pure wait node - pauses until user responds
          result = await this.executeWaitForResponse(lead, job.nodeData.config, run, automation, job);
          shouldWaitForResponse = true;
          break;
        case 'aiCall':
          result = await this.executeAICall(lead, job.nodeData.config, run);
          break;
        case 'aiCallWithResponse':
          // AI call that waits for call completion result via webhook
          result = await this.executeAICallWithResponse(lead, job.nodeData.config, run);
          shouldWaitForResponse = true;
          break;
        case 'humanCall':
          result = await this.executeHumanCall(lead, job.nodeData.config, run);
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

      // If we're waiting for response, don't schedule next nodes yet
      if (shouldWaitForResponse) {
        // Update execution path to waiting status
        const pathIndex = run.executionPath.length - 1;
        run.executionPath[pathIndex].status = 'waiting';
        run.executionPath[pathIndex].result = result;
        await run.save();

        // Mark job as completed (the waiting is tracked on the run, not the job)
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date();
        await job.save();

        console.log(`⏸️ Automation paused, waiting for response from ${lead.phone}`);
        return; // Don't schedule next nodes - they'll be scheduled when response comes in
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
   * Execute WhatsApp action that waits for response
   * Sends message and pauses automation until user responds
   */
  async executeWhatsAppWithResponse(lead, config, run, automation, job) {
    try {
      console.log(`📱 Executing WhatsApp with response wait for lead ${lead.name}`);
      
      // First, send the WhatsApp message
      const sendResult = await this.executeWhatsApp(lead, config, { userId: lead.assignedTo });
      
      if (!sendResult.success) {
        return sendResult;
      }
      
      // Set up waiting for response
      const timeoutDuration = this.calculateDelay(config.timeout || { duration: 24, unit: 'hours' });
      const timeoutAt = new Date(Date.now() + timeoutDuration);
      
      // Parse expected responses from config
      const expectedResponses = (config.expectedResponses || []).map(resp => ({
        type: resp.type || 'any',
        value: resp.value || resp.payload,
        nextHandle: resp.nextHandle || resp.handle || 'default'
      }));
      
      // If no explicit responses defined but buttons are in message, extract them
      if (expectedResponses.length === 0 && config.buttons && Array.isArray(config.buttons)) {
        config.buttons.forEach((btn, idx) => {
          expectedResponses.push({
            type: 'button',
            value: btn.payload || btn.text,
            nextHandle: btn.handle || `option${idx + 1}`
          });
        });
      }
      
      // Normalize phone number for matching
      let normalizedPhone = lead.phone.replace(/[\s\-\(\)]/g, '');
      if (normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.substring(1);
      }
      if (!normalizedPhone.startsWith('91') && normalizedPhone.length === 10) {
        normalizedPhone = '91' + normalizedPhone;
      }
      
      // Update run to waiting state
      run.status = 'waiting_for_response';
      run.waitingForResponse = {
        isWaiting: true,
        nodeId: job.nodeId,
        messageId: sendResult.messageId,
        phoneNumber: normalizedPhone,
        expectedResponses,
        timeoutAt,
        timeoutHandle: config.timeoutHandle || 'timeout',
        startedAt: new Date()
      };
      await run.save();
      
      console.log(`⏸️ Automation paused, waiting for response from ${normalizedPhone}`);
      console.log(`   Timeout at: ${timeoutAt.toISOString()}`);
      
      return {
        success: true,
        messageId: sendResult.messageId,
        waiting: true,
        timeoutAt,
        expectedResponses
      };
    } catch (error) {
      console.error('WhatsApp with response execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute wait for response node
   * Pauses automation until user sends a WhatsApp message
   */
  async executeWaitForResponse(lead, config, run, automation, job) {
    try {
      console.log(`⏸️ Setting up wait for response for lead ${lead.name}`);
      
      // Calculate timeout
      const timeoutDuration = this.calculateDelay(config.timeout || { duration: 24, unit: 'hours' });
      const timeoutAt = new Date(Date.now() + timeoutDuration);
      
      // Parse expected responses
      const expectedResponses = (config.expectedResponses || []).map(resp => ({
        type: resp.type || 'any',
        value: resp.value,
        nextHandle: resp.nextHandle || 'default'
      }));
      
      // Normalize phone number
      let normalizedPhone = lead.phone.replace(/[\s\-\(\)]/g, '');
      if (normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.substring(1);
      }
      if (!normalizedPhone.startsWith('91') && normalizedPhone.length === 10) {
        normalizedPhone = '91' + normalizedPhone;
      }
      
      // Update run to waiting state
      run.status = 'waiting_for_response';
      run.waitingForResponse = {
        isWaiting: true,
        nodeId: job.nodeId,
        messageId: null, // No message sent, just waiting
        phoneNumber: normalizedPhone,
        expectedResponses,
        timeoutAt,
        timeoutHandle: config.timeoutHandle || 'timeout',
        startedAt: new Date()
      };
      await run.save();
      
      console.log(`⏸️ Automation paused at wait node, expecting response from ${normalizedPhone}`);
      
      return {
        success: true,
        waiting: true,
        timeoutAt,
        expectedResponses
      };
    } catch (error) {
      console.error('Wait for response execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume automation from a WhatsApp response
   * Called by the webhook service when a response is received
   */
  async resumeFromResponse(run, parsedMessage) {
    try {
      console.log(`▶️ Resuming automation ${run._id} from response`);
      
      const automation = run.automation;
      const lead = run.lead;
      
      if (!automation || !lead) {
        throw new Error('Missing automation or lead data');
      }
      
      // Store the response in run context
      run.lastResponse = {
        type: parsedMessage.type === 'interactive' || parsedMessage.buttonPayload ? 'button' : parsedMessage.type,
        value: parsedMessage.value,
        rawPayload: parsedMessage.raw,
        receivedAt: new Date()
      };
      
      // Add response to context for use in subsequent nodes
      if (!run.context) run.context = {};
      run.context.lastResponse = run.lastResponse;
      run.context.responseText = parsedMessage.text || parsedMessage.buttonText;
      run.context.responsePayload = parsedMessage.buttonPayload || parsedMessage.value;
      
      // Determine which handle to use based on response
      let nextHandle = 'default';
      const expectedResponses = run.waitingForResponse?.expectedResponses || [];
      
      for (const expected of expectedResponses) {
        if (expected.type === 'any') {
          nextHandle = expected.nextHandle;
          break;
        }
        
        if (expected.type === 'button' && parsedMessage.buttonPayload) {
          if (parsedMessage.buttonPayload === expected.value || 
              parsedMessage.buttonText?.toLowerCase() === expected.value?.toLowerCase()) {
            nextHandle = expected.nextHandle;
            break;
          }
        }
        
        if (expected.type === 'text' && parsedMessage.text) {
          const pattern = new RegExp(expected.value, 'i');
          if (pattern.test(parsedMessage.text)) {
            nextHandle = expected.nextHandle;
            break;
          }
        }
      }
      
      console.log(`   Response matched handle: ${nextHandle}`);
      
      // Update execution path
      const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === run.waitingForResponse?.nodeId && p.status === 'waiting'
      );
      if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = {
          responseReceived: true,
          responseType: run.lastResponse.type,
          responseValue: run.lastResponse.value,
          matchedHandle: nextHandle
        };
      }
      
      // Clear waiting state
      const waitingNodeId = run.waitingForResponse.nodeId;
      run.status = 'running';
      run.waitingForResponse.isWaiting = false;
      await run.save();
      
      // Update lead status
      lead.whatsappStatus = 'replied';
      lead.lastWhatsappAt = new Date();
      lead.lastContactAt = new Date();
      await lead.save();
      
      // Get next nodes and schedule them
      const nextNodes = automation.getNextNodes(waitingNodeId, nextHandle);
      
      if (nextNodes.length === 0) {
        console.log(`   No next nodes found for handle "${nextHandle}", trying default`);
        // Try with no handle filter
        const defaultNodes = automation.getNextNodes(waitingNodeId);
        if (defaultNodes.length > 0) {
          for (const { node, edge } of defaultNodes) {
            let delay = 0;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
              delay = this.calculateDelay(node.data.config);
            }
            await this.scheduleNode(run, automation, lead, node, edge, delay);
          }
        } else {
          // No more nodes - complete the run
          run.status = 'completed';
          run.completedAt = new Date();
          await run.save();
          
          automation.successCount += 1;
          await automation.save();
          
          console.log(`✅ Automation run completed: ${automation.name}`);
        }
      } else {
        for (const { node, edge } of nextNodes) {
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
      }
      
      return {
        success: true,
        handle: nextHandle,
        nextNodesScheduled: nextNodes.length || automation.getNextNodes(waitingNodeId).length
      };
      
    } catch (error) {
      console.error('Error resuming from response:', error);
      
      // Mark run as failed
      run.status = 'failed';
      run.error = error.message;
      await run.save();
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume automation after timeout (no response received)
   * Called by the timeout processor
   */
  async resumeFromTimeout(run) {
    try {
      console.log(`⏰ Resuming automation ${run._id} from timeout`);
      
      const automation = run.automation;
      const lead = run.lead;
      
      if (!automation || !lead) {
        throw new Error('Missing automation or lead data');
      }
      
      // Store timeout in context
      if (!run.context) run.context = {};
      run.context.timedOut = true;
      run.context.timeoutAt = new Date();
      
      // Update execution path
      const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === run.waitingForResponse?.nodeId && p.status === 'waiting'
      );
      if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = {
          timedOut: true,
          timeoutAt: new Date()
        };
      }
      
      // Get the timeout handle
      const timeoutHandle = run.waitingForResponse?.timeoutHandle || 'timeout';
      const waitingNodeId = run.waitingForResponse.nodeId;
      
      // Clear waiting state
      run.status = 'running';
      run.waitingForResponse.isWaiting = false;
      await run.save();
      
      // Update lead status
      lead.whatsappStatus = 'not_responding';
      await lead.save();
      
      // Get next nodes using timeout handle
      const nextNodes = automation.getNextNodes(waitingNodeId, timeoutHandle);
      
      if (nextNodes.length === 0) {
        // No timeout path - complete the run
        run.status = 'completed';
        run.completedAt = new Date();
        await run.save();
        
        console.log(`✅ Automation run completed (timeout, no timeout path): ${automation.name}`);
      } else {
        for (const { node, edge } of nextNodes) {
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
        console.log(`⏰ Timeout path scheduled: ${nextNodes.length} nodes`);
      }
      
      return { success: true, timedOut: true, nextNodesScheduled: nextNodes.length };
      
    } catch (error) {
      console.error('Error resuming from timeout:', error);
      
      run.status = 'failed';
      run.error = error.message;
      await run.save();
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume automation from AI call result
   * Called by the ElevenLabs webhook when a call completes
   */
  async resumeFromCallResult(run, callResult) {
    try {
      console.log(`📞 Resuming automation ${run._id} from call result: ${callResult.outcome}`);
      
      const automation = run.automation;
      const lead = run.lead;
      
      if (!automation || !lead) {
        throw new Error('Missing automation or lead data');
      }
      
      // Store the call result in run
      run.lastCallResult = {
        outcome: callResult.outcome,
        status: callResult.status,
        duration: callResult.duration,
        transcriptSummary: callResult.transcriptSummary,
        analysis: callResult.analysis,
        evaluationResults: callResult.evaluationResults,
        sentiment: callResult.analysis?.sentiment,
        intent: callResult.analysis?.intent,
        receivedAt: new Date()
      };
      
      // Add call result to context for use in subsequent nodes
      if (!run.context) run.context = {};
      run.context.lastCallResult = run.lastCallResult;
      run.context.callOutcome = callResult.outcome;
      run.context.callDuration = callResult.duration;
      run.context.callSummary = callResult.transcriptSummary;
      run.context.isInterested = callResult.evaluationResults?.interested === 'true' || 
                                 callResult.evaluationResults?.interested === true;
      run.context.callbackRequested = callResult.evaluationResults?.callback_requested === 'true' ||
                                      callResult.evaluationResults?.callback_requested === true;
      
      // Determine which handle to use based on call outcome
      let nextHandle = 'default';
      const expectedOutcomes = run.waitingForCall?.expectedOutcomes || [];
      
      for (const expected of expectedOutcomes) {
        if (expected.outcome === callResult.outcome) {
          nextHandle = expected.nextHandle;
          break;
        }
      }
      
      // Fallback mapping if no exact match
      if (nextHandle === 'default') {
        if (callResult.outcome === 'interested') nextHandle = 'interested';
        else if (callResult.outcome === 'not_interested') nextHandle = 'not_interested';
        else if (callResult.outcome === 'callback_requested') nextHandle = 'callback';
        else if (callResult.outcome === 'answered') nextHandle = 'answered';
        else if (callResult.outcome === 'no_answer') nextHandle = 'no_answer';
        else if (callResult.outcome === 'voicemail') nextHandle = 'voicemail';
        else if (callResult.outcome === 'busy') nextHandle = 'busy';
        else if (callResult.outcome === 'failed') nextHandle = 'failed';
      }
      
      console.log(`   Call outcome matched handle: ${nextHandle}`);
      
      // Update execution path
      const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === run.waitingForCall?.nodeId && p.status === 'waiting'
      );
      if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = {
          callCompleted: true,
          outcome: callResult.outcome,
          duration: callResult.duration,
          matchedHandle: nextHandle,
          transcriptSummary: callResult.transcriptSummary
        };
      }
      
      // Clear waiting state
      const waitingNodeId = run.waitingForCall.nodeId;
      run.status = 'running';
      run.waitingForCall.isWaiting = false;
      await run.save();
      
      // Update lead based on call outcome
      lead.lastContactedAt = new Date();
      lead.lastCallAt = new Date();
      if (callResult.outcome === 'interested') {
        lead.status = 'Qualified';
      } else if (callResult.outcome === 'answered' && 
                 (lead.status === 'New' || lead.status === 'Unassigned')) {
        lead.status = 'Contacted';
      }
      await lead.save();
      
      // Get next nodes and schedule them
      const nextNodes = automation.getNextNodes(waitingNodeId, nextHandle);
      
      if (nextNodes.length === 0) {
        console.log(`   No next nodes found for handle "${nextHandle}", trying default`);
        // Try with no handle filter
        const defaultNodes = automation.getNextNodes(waitingNodeId);
        if (defaultNodes.length > 0) {
          for (const { node, edge } of defaultNodes) {
            let delay = 0;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
              delay = this.calculateDelay(node.data.config);
            }
            await this.scheduleNode(run, automation, lead, node, edge, delay);
          }
        } else {
          // No more nodes - complete the run
          run.status = 'completed';
          run.completedAt = new Date();
          await run.save();
          
          automation.successCount += 1;
          await automation.save();
          
          console.log(`✅ Automation run completed: ${automation.name}`);
        }
      } else {
        for (const { node, edge } of nextNodes) {
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
      }
      
      return {
        success: true,
        outcome: callResult.outcome,
        handle: nextHandle,
        nextNodesScheduled: nextNodes.length || automation.getNextNodes(waitingNodeId).length
      };
      
    } catch (error) {
      console.error('Error resuming from call result:', error);
      
      // Mark run as failed
      run.status = 'failed';
      run.error = error.message;
      await run.save();
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Resume automation after call timeout (no result received)
   * Called by the timeout processor for AI calls
   */
  async resumeFromCallTimeout(run) {
    try {
      console.log(`⏰ Resuming automation ${run._id} from call timeout`);
      
      const automation = run.automation;
      const lead = run.lead;
      
      if (!automation || !lead) {
        throw new Error('Missing automation or lead data');
      }
      
      // Store timeout in context
      if (!run.context) run.context = {};
      run.context.callTimedOut = true;
      run.context.callTimeoutAt = new Date();
      
      // Update execution path
      const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === run.waitingForCall?.nodeId && p.status === 'waiting'
      );
      if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = {
          timedOut: true,
          timeoutAt: new Date()
        };
      }
      
      // Get the timeout handle
      const timeoutHandle = run.waitingForCall?.timeoutHandle || 'timeout';
      const waitingNodeId = run.waitingForCall.nodeId;
      
      // Clear waiting state
      run.status = 'running';
      run.waitingForCall.isWaiting = false;
      await run.save();
      
      // Get next nodes using timeout handle
      const nextNodes = automation.getNextNodes(waitingNodeId, timeoutHandle);
      
      if (nextNodes.length === 0) {
        // No timeout path - complete the run
        run.status = 'completed';
        run.completedAt = new Date();
        await run.save();
        
        console.log(`✅ Automation run completed (call timeout, no timeout path): ${automation.name}`);
      } else {
        for (const { node, edge } of nextNodes) {
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
        console.log(`⏰ Call timeout path scheduled: ${nextNodes.length} nodes`);
      }
      
      return { success: true, timedOut: true, nextNodesScheduled: nextNodes.length };
      
    } catch (error) {
      console.error('Error resuming from call timeout:', error);
      
      run.status = 'failed';
      run.error = error.message;
      await run.save();
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute AI Call with response waiting
   * Similar to executeWhatsAppWithResponse - makes call and waits for result via webhook
   */
  async executeAICallWithResponse(lead, config, run) {
    try {
      if (!lead.phone) {
        return { success: false, error: 'Lead has no phone number' };
      }

      console.log(`📞 Executing AI call with response for lead ${lead.name}`);
      
      // Make the call
      const result = await elevenLabsService.makeCall(lead.phone, {
        script: config?.script,
        voiceId: config?.voiceId,
        leadName: lead.name,
        leadData: lead,
        // Pass metadata for webhook callback integration
        metadata: {
          automationRunId: run._id.toString(),
          leadId: lead._id.toString(),
          automationId: run.automation.toString(),
          nodeId: run.currentNodeId
        }
      });
      
      if (!result?.success && !result?.callId) {
        return { success: false, error: result?.error || 'Failed to initiate call' };
      }

      // Calculate timeout (default 10 minutes for calls)
      const timeoutMinutes = config?.timeout || 10;
      const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

      // Set up expected outcomes from config
      const expectedOutcomes = [];
      
      // Add expected outcomes from config
      if (config?.onInterested) {
        expectedOutcomes.push({ outcome: 'interested', nextHandle: 'interested' });
      }
      if (config?.onNotInterested) {
        expectedOutcomes.push({ outcome: 'not_interested', nextHandle: 'not_interested' });
      }
      if (config?.onCallbackRequested) {
        expectedOutcomes.push({ outcome: 'callback_requested', nextHandle: 'callback' });
      }
      if (config?.onAnswered) {
        expectedOutcomes.push({ outcome: 'answered', nextHandle: 'answered' });
      }
      if (config?.onNoAnswer) {
        expectedOutcomes.push({ outcome: 'no_answer', nextHandle: 'no_answer' });
      }
      if (config?.onVoicemail) {
        expectedOutcomes.push({ outcome: 'voicemail', nextHandle: 'voicemail' });
      }
      if (config?.onBusy) {
        expectedOutcomes.push({ outcome: 'busy', nextHandle: 'busy' });
      }
      if (config?.onFailed) {
        expectedOutcomes.push({ outcome: 'failed', nextHandle: 'failed' });
      }

      // Put run in waiting state
      run.status = 'waiting_for_response';
      run.waitingForCall = {
        isWaiting: true,
        nodeId: run.currentNodeId,
        callId: result.callId,
        conversationId: result.conversationId,
        phoneNumber: lead.phone,
        expectedOutcomes: expectedOutcomes,
        timeoutAt: timeoutAt,
        timeoutHandle: config?.timeoutHandle || 'timeout',
        startedAt: new Date()
      };
      
      // Update execution path
      const currentPathIndex = run.executionPath.findIndex(
        p => p.nodeId === run.currentNodeId && p.status === 'running'
      );
      if (currentPathIndex >= 0) {
        run.executionPath[currentPathIndex].status = 'waiting';
        run.executionPath[currentPathIndex].result = {
          callInitiated: true,
          callId: result.callId,
          conversationId: result.conversationId,
          waitingForResult: true
        };
      }
      
      // Store in context
      if (!run.context) run.context = {};
      run.context.lastCallId = result.callId;
      run.context.lastCallConversationId = result.conversationId;
      run.context.lastCallStatus = 'initiated';
      
      await run.save();
      
      console.log(`📞 Call initiated, waiting for result. CallID: ${result.callId}, Timeout: ${timeoutAt}`);
      
      return {
        success: true,
        waiting: true,
        callId: result.callId,
        conversationId: result.conversationId,
        timeoutAt: timeoutAt
      };
      
    } catch (error) {
      console.error('AI Call with response error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process call timeouts - called periodically to check for timed out AI calls
   */
  async processCallTimeouts() {
    const timedOut = await AutomationRun.findTimedOutCalls();
    
    for (const run of timedOut) {
      try {
        await this.resumeFromCallTimeout(run);
      } catch (error) {
        console.error(`Error processing call timeout for run ${run._id}:`, error);
      }
    }
    
    return timedOut.length;
  }

  /**
   * Execute AI Call action
   * Now passes automation run ID to ElevenLabs for callback integration
   */
  async executeAICall(lead, config, run = null) {
    try {
      if (!lead.phone) {
        return { success: false, error: 'Lead has no phone number' };
      }

      // Use ElevenLabs service for AI call
      // Pass automation run ID in metadata for webhook callback
      const result = await elevenLabsService.makeCall(lead.phone, {
        script: config?.script,
        voiceId: config?.voiceId,
        leadName: lead.name,
        leadData: lead,
        // Pass metadata for webhook callback integration
        metadata: {
          automationRunId: run?._id?.toString(),
          leadId: lead._id?.toString(),
          automationId: run?.automation?.toString(),
          nodeId: run?.currentNodeId
        }
      });

      // Store call ID in run context for future reference
      if (run && result?.callId) {
        if (!run.context) run.context = {};
        run.context.lastCallId = result.callId;
        run.context.lastCallStatus = result.status;
        await run.save();
      }

      return {
        success: true,
        callId: result?.callId,
        status: result?.status,
        automationRunId: run?._id
      };
    } catch (error) {
      console.error('AI Call execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute Human Call action (creates a task for agent)
   * Now tracks the automation run ID for potential callback integration
   */
  async executeHumanCall(lead, config, run = null) {
    try {
      // Create an activity/task for the assigned agent
      const Activity = require('../models/Activity');
      
      const activity = new Activity({
        lead: lead._id,
        type: 'call_scheduled',
        title: `Call lead: ${lead.name}`,
        description: config?.notes || 'Automated call task from workflow',
        assignedTo: lead.assignedAgent || lead.assignedTo,
        dueDate: new Date(),
        priority: config?.priority || 'high',
        status: 'pending',
        // Store automation run ID for callback when agent completes the task
        metadata: {
          automationRunId: run?._id?.toString(),
          automationTriggered: true,
          nodeId: run?.currentNodeId
        }
      });
      await activity.save();

      // Store activity ID in run context
      if (run) {
        if (!run.context) run.context = {};
        run.context.lastTaskId = activity._id;
        run.context.lastTaskType = 'human_call';
        await run.save();
      }

      return {
        success: true,
        activityId: activity._id,
        message: 'Call task created for agent',
        automationRunId: run?._id
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

  // ==========================================
  // ISSUE #5: Resume from Task Completion
  // ==========================================

  /**
   * Resume automation when an agent completes a task (human call, etc.)
   * Called from leads.service.js when task is marked complete
   */
  async resumeFromTaskCompletion(task) {
    try {
      const automationRunId = task.metadata?.automationRunId;
      const nodeId = task.metadata?.nodeId;
      
      if (!automationRunId) {
        console.log('⚠️ Task has no automation run ID, skipping resume');
        return { success: false, reason: 'No automation run ID' };
      }

      // Find the automation run
      const run = await AutomationRun.findById(automationRunId)
        .populate('lead')
        .populate('automation');
      
      if (!run) {
        console.log(`⚠️ Automation run ${automationRunId} not found`);
        return { success: false, reason: 'Run not found' };
      }

      // Check if run is in a state that can be resumed
      if (run.status !== 'waiting_for_response' && run.status !== 'running') {
        console.log(`⚠️ Run ${automationRunId} is in ${run.status} state, cannot resume`);
        return { success: false, reason: `Run is ${run.status}` };
      }

      console.log(`📋 Resuming automation ${run._id} from task completion`);
      
      const automation = run.automation;
      const lead = run.lead;

      // Store task completion in context
      if (!run.context) run.context = {};
      run.context.taskCompleted = true;
      run.context.taskCompletedAt = new Date();
      run.context.taskOutcome = task.outcome || 'completed';
      run.context.taskNotes = task.description;

      // Update execution path
      const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === nodeId && (p.status === 'waiting' || p.status === 'running')
      );
      if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = {
          taskCompleted: true,
          outcome: task.outcome,
          completedBy: task.userId?.toString()
        };
      }

      // Determine next handle based on task outcome
      let nextHandle = 'completed';
      if (task.outcome === 'positive') nextHandle = 'positive';
      else if (task.outcome === 'negative') nextHandle = 'negative';
      
      // Clear any waiting state
      run.status = 'running';
      if (run.waitingForResponse) run.waitingForResponse.isWaiting = false;
      if (run.waitingForCall) run.waitingForCall.isWaiting = false;
      await run.save();

      // Get next nodes and schedule them
      const nextNodes = automation.getNextNodes(nodeId, nextHandle);
      
      if (nextNodes.length === 0) {
        // Try default handle
        const defaultNodes = automation.getNextNodes(nodeId);
        if (defaultNodes.length > 0) {
          for (const { node, edge } of defaultNodes) {
            let delay = 0;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
              delay = this.calculateDelay(node.data.config);
            }
            await this.scheduleNode(run, automation, lead, node, edge, delay);
          }
        } else {
          // No more nodes - complete the run
          run.status = 'completed';
          run.completedAt = new Date();
          await run.save();
          
          automation.successCount += 1;
          await automation.save();
          
          console.log(`✅ Automation run completed after task: ${automation.name}`);
        }
      } else {
        for (const { node, edge } of nextNodes) {
          let delay = 0;
          if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = this.calculateDelay(node.data.config);
          }
          await this.scheduleNode(run, automation, lead, node, edge, delay);
        }
      }

      return {
        success: true,
        handle: nextHandle,
        nextNodesScheduled: nextNodes.length || automation.getNextNodes(nodeId).length
      };

    } catch (error) {
      console.error('Error resuming from task completion:', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // ISSUE #7: Run History Cleanup
  // ==========================================

  /**
   * Clean up old automation runs to prevent database bloat
   * Should be called periodically (e.g., daily via cron)
   * 
   * @param {number} daysToKeep - Number of days to keep completed runs (default: 30)
   * @param {number} failedDaysToKeep - Number of days to keep failed runs (default: 90)
   */
  async cleanupOldRuns(daysToKeep = 30, failedDaysToKeep = 90) {
    try {
      const now = new Date();
      
      // Calculate cutoff dates
      const completedCutoff = new Date(now - daysToKeep * 24 * 60 * 60 * 1000);
      const failedCutoff = new Date(now - failedDaysToKeep * 24 * 60 * 60 * 1000);

      console.log(`🧹 Starting cleanup: Completed runs older than ${daysToKeep} days, Failed runs older than ${failedDaysToKeep} days`);

      // Delete old completed runs
      const completedResult = await AutomationRun.deleteMany({
        status: 'completed',
        completedAt: { $lt: completedCutoff }
      });
      console.log(`   Deleted ${completedResult.deletedCount} completed runs`);

      // Delete old failed runs
      const failedResult = await AutomationRun.deleteMany({
        status: 'failed',
        updatedAt: { $lt: failedCutoff }
      });
      console.log(`   Deleted ${failedResult.deletedCount} failed runs`);

      // Delete old cancelled runs (same as completed)
      const cancelledResult = await AutomationRun.deleteMany({
        status: 'cancelled',
        updatedAt: { $lt: completedCutoff }
      });
      console.log(`   Deleted ${cancelledResult.deletedCount} cancelled runs`);

      // Delete orphan jobs (jobs whose runs no longer exist)
      const existingRunIds = await AutomationRun.find({}, '_id').distinct('_id');
      const orphanJobsResult = await AutomationJob.deleteMany({
        automationRun: { $nin: existingRunIds }
      });
      console.log(`   Deleted ${orphanJobsResult.deletedCount} orphan jobs`);

      // Delete old completed jobs (older than 7 days)
      const jobsCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const oldJobsResult = await AutomationJob.deleteMany({
        status: 'completed',
        completedAt: { $lt: jobsCutoff }
      });
      console.log(`   Deleted ${oldJobsResult.deletedCount} old completed jobs`);

      const totalDeleted = completedResult.deletedCount + failedResult.deletedCount + 
                          cancelledResult.deletedCount + orphanJobsResult.deletedCount + 
                          oldJobsResult.deletedCount;
      
      console.log(`🧹 Cleanup complete: ${totalDeleted} total records deleted`);

      return {
        success: true,
        deleted: {
          completedRuns: completedResult.deletedCount,
          failedRuns: failedResult.deletedCount,
          cancelledRuns: cancelledResult.deletedCount,
          orphanJobs: orphanJobsResult.deletedCount,
          oldJobs: oldJobsResult.deletedCount,
          total: totalDeleted
        }
      };

    } catch (error) {
      console.error('Error during cleanup:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get cleanup statistics without deleting
   */
  async getCleanupStats(daysToKeep = 30, failedDaysToKeep = 90) {
    const now = new Date();
    const completedCutoff = new Date(now - daysToKeep * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(now - failedDaysToKeep * 24 * 60 * 60 * 1000);

    const completedCount = await AutomationRun.countDocuments({
      status: 'completed',
      completedAt: { $lt: completedCutoff }
    });

    const failedCount = await AutomationRun.countDocuments({
      status: 'failed',
      updatedAt: { $lt: failedCutoff }
    });

    const cancelledCount = await AutomationRun.countDocuments({
      status: 'cancelled',
      updatedAt: { $lt: completedCutoff }
    });

    return {
      wouldDelete: {
        completedRuns: completedCount,
        failedRuns: failedCount,
        cancelledRuns: cancelledCount,
        total: completedCount + failedCount + cancelledCount
      },
      cutoffDates: {
        completed: completedCutoff,
        failed: failedCutoff
      }
    };
  }

  // ==========================================
  // ISSUE #8: Error Recovery Improvements
  // ==========================================

  /**
   * Execute job with enhanced error handling
   * Supports: skip on failure, failure path, admin notifications
   */
  async executeJobWithRecovery(job, options = {}) {
    const { skipOnFailure = false, hasFailurePath = false, notifyOnFailure = true } = options;
    
    try {
      return await this.executeJob(job);
    } catch (error) {
      console.error(`❌ Job failed with recovery options:`, error.message);
      
      // Notify admin if enabled
      if (notifyOnFailure) {
        await this.notifyAdminOfFailure(job, error);
      }

      // If skipOnFailure is enabled, mark as skipped and continue
      if (skipOnFailure) {
        return await this.skipFailedNode(job, error);
      }

      // If there's a failure path, take it
      if (hasFailurePath) {
        return await this.takeFailurePath(job, error);
      }

      // Otherwise, let the normal error handling take over
      throw error;
    }
  }

  /**
   * Skip a failed node and continue to next nodes
   */
  async skipFailedNode(job, error) {
    try {
      console.log(`⏭️ Skipping failed node: ${job.nodeData?.label || job.nodeId}`);
      
      const run = await AutomationRun.findById(job.automationRun);
      const automation = await Automation.findById(job.automation);
      const lead = await Lead.findById(job.lead);

      if (!run || !automation || !lead) {
        throw new Error('Missing run, automation, or lead');
      }

      // Update execution path to show skipped
      const pathIndex = run.executionPath.findIndex(
        p => p.nodeId === job.nodeId && p.status === 'running'
      );
      if (pathIndex >= 0) {
        run.executionPath[pathIndex].status = 'skipped';
        run.executionPath[pathIndex].error = error.message;
        run.executionPath[pathIndex].completedAt = new Date();
      }
      await run.save();

      // Mark job as skipped
      job.status = 'completed';
      job.result = { skipped: true, error: error.message };
      job.completedAt = new Date();
      await job.save();

      // Schedule next nodes (using default path)
      const nextNodes = automation.getNextNodes(job.nodeId);
      for (const { node, edge } of nextNodes) {
        let delay = 0;
        if (node.data?.type === 'delay' || node.data?.type === 'wait') {
          delay = this.calculateDelay(node.data.config);
        }
        await this.scheduleNode(run, automation, lead, node, edge, delay);
      }

      return { success: true, skipped: true };

    } catch (err) {
      console.error('Error skipping failed node:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Take the failure path when a node fails
   */
  async takeFailurePath(job, error) {
    try {
      console.log(`🔀 Taking failure path for: ${job.nodeData?.label || job.nodeId}`);
      
      const run = await AutomationRun.findById(job.automationRun);
      const automation = await Automation.findById(job.automation);
      const lead = await Lead.findById(job.lead);

      if (!run || !automation || !lead) {
        throw new Error('Missing run, automation, or lead');
      }

      // Update execution path
      const pathIndex = run.executionPath.findIndex(
        p => p.nodeId === job.nodeId && p.status === 'running'
      );
      if (pathIndex >= 0) {
        run.executionPath[pathIndex].status = 'failed';
        run.executionPath[pathIndex].error = error.message;
        run.executionPath[pathIndex].completedAt = new Date();
      }
      
      // Store error in context for use in failure path
      if (!run.context) run.context = {};
      run.context.lastError = error.message;
      run.context.failedNodeId = job.nodeId;
      run.context.failedNodeType = job.nodeType;
      await run.save();

      // Mark job as failed but don't stop the run
      job.status = 'completed';
      job.result = { failed: true, error: error.message, tookFailurePath: true };
      job.completedAt = new Date();
      await job.save();

      // Look for failure path (handle = 'failure' or 'error')
      let nextNodes = automation.getNextNodes(job.nodeId, 'failure');
      if (nextNodes.length === 0) {
        nextNodes = automation.getNextNodes(job.nodeId, 'error');
      }

      if (nextNodes.length === 0) {
        console.log('⚠️ No failure path found, stopping automation');
        run.status = 'failed';
        run.error = error.message;
        await run.save();
        return { success: false, reason: 'No failure path found' };
      }

      for (const { node, edge } of nextNodes) {
        let delay = 0;
        if (node.data?.type === 'delay' || node.data?.type === 'wait') {
          delay = this.calculateDelay(node.data.config);
        }
        await this.scheduleNode(run, automation, lead, node, edge, delay);
      }

      return { success: true, tookFailurePath: true, nextNodes: nextNodes.length };

    } catch (err) {
      console.error('Error taking failure path:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Notify admin of critical automation failure
   */
  async notifyAdminOfFailure(job, error) {
    try {
      const run = await AutomationRun.findById(job.automationRun);
      const automation = await Automation.findById(job.automation);
      const lead = await Lead.findById(job.lead);

      const notification = {
        type: 'automation_failure',
        severity: 'critical',
        timestamp: new Date(),
        details: {
          automationId: automation?._id,
          automationName: automation?.name,
          runId: run?._id,
          leadId: lead?._id,
          leadName: lead?.name,
          leadPhone: lead?.phone,
          nodeId: job.nodeId,
          nodeType: job.nodeType,
          nodeLabel: job.nodeData?.label,
          error: error.message,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts
        }
      };

      console.log(`🚨 ADMIN NOTIFICATION:`, JSON.stringify(notification, null, 2));

      // Try to send email notification if email service is configured
      try {
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail) {
          await emailService.sendEmail({
            to: adminEmail,
            subject: `🚨 Automation Failure: ${automation?.name || 'Unknown'}`,
            text: `
Automation Failure Alert
========================

Automation: ${automation?.name || 'Unknown'}
Lead: ${lead?.name || 'Unknown'} (${lead?.phone || 'No phone'})
Failed Node: ${job.nodeData?.label || job.nodeId}
Error: ${error.message}
Attempts: ${job.attempts}/${job.maxAttempts}

Run ID: ${run?._id}
Time: ${new Date().toISOString()}

Please check the automation dashboard for details.
            `.trim()
          });
          console.log(`📧 Admin notification email sent to ${adminEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send admin email:', emailError.message);
      }

      // Store notification in database for dashboard
      const Activity = require('../models/Activity');
      await Activity.create({
        leadId: lead?._id?.toString() || 'system',
        type: 'note',
        title: `⚠️ Automation Failed: ${automation?.name}`,
        description: `Error in "${job.nodeData?.label}": ${error.message}`,
        metadata: notification.details
      });

      return notification;

    } catch (err) {
      console.error('Error sending admin notification:', err);
      return null;
    }
  }

  /**
   * Recover stuck automations
   * Finds runs that have been "running" or "waiting" for too long
   */
  async recoverStuckAutomations(stuckThresholdHours = 24) {
    try {
      const threshold = new Date(Date.now() - stuckThresholdHours * 60 * 60 * 1000);
      
      console.log(`🔧 Looking for automations stuck since ${threshold.toISOString()}`);

      // Find stuck running automations
      const stuckRuns = await AutomationRun.find({
        status: { $in: ['running', 'waiting_for_response'] },
        updatedAt: { $lt: threshold }
      }).populate('lead').populate('automation');

      console.log(`   Found ${stuckRuns.length} stuck automations`);

      let recovered = 0;
      let failed = 0;

      for (const run of stuckRuns) {
        try {
          // Check if there are any pending jobs
          const pendingJobs = await AutomationJob.countDocuments({
            automationRun: run._id,
            status: 'pending'
          });

          if (pendingJobs > 0) {
            // Jobs exist but stuck - might be a processing issue
            console.log(`   Run ${run._id}: ${pendingJobs} pending jobs, attempting to process`);
            
            // Reset any "processing" jobs back to pending
            await AutomationJob.updateMany(
              { automationRun: run._id, status: 'processing' },
              { status: 'pending', scheduledFor: new Date() }
            );
            recovered++;
          } else if (run.status === 'waiting_for_response') {
            // Waiting for response that never came - trigger timeout
            console.log(`   Run ${run._id}: Timeout on waiting_for_response`);
            
            if (run.waitingForResponse?.isWaiting) {
              await this.resumeFromTimeout(run);
            } else if (run.waitingForCall?.isWaiting) {
              await this.resumeFromCallTimeout(run);
            } else {
              // Unknown waiting state - mark as failed
              run.status = 'failed';
              run.error = 'Stuck in waiting state with no pending response';
              await run.save();
              failed++;
            }
            recovered++;
          } else {
            // Running but no jobs - something went wrong
            console.log(`   Run ${run._id}: No pending jobs, marking as failed`);
            run.status = 'failed';
            run.error = 'Automation stuck with no pending jobs';
            await run.save();
            failed++;
          }
        } catch (err) {
          console.error(`   Error recovering run ${run._id}:`, err);
          failed++;
        }
      }

      console.log(`🔧 Recovery complete: ${recovered} recovered, ${failed} failed`);

      return {
        success: true,
        found: stuckRuns.length,
        recovered,
        failed
      };

    } catch (error) {
      console.error('Error recovering stuck automations:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
const workflowEngine = new WorkflowEngine();

module.exports = workflowEngine;
