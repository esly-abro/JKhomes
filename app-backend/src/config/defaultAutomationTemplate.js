/**
 * Default Lead Nurturing Automation Flow
 * Based on the complete lead management workflow flowchart
 * 
 * Flow Overview:
 * 1. Lead Sources → CRM Entry
 * 2. Automated WhatsApp Msg 1 (Immediate)
 * 3. Wait for response → Follow-up sequences
 * 4. AI Voice Call (IVR System)
 * 5. Human Agent Manual Call
 * 6. Appointment Scheduling
 * 7. Post-appointment follow-up sequence
 * 8. Final negotiation → Close
 */

const defaultAutomationTemplate = {
  name: 'Lead Nurturing Flow',
  description: 'Complete lead management workflow with WhatsApp, AI calls, human calls, appointments, and follow-ups.',
  isDefault: true,
  
  nodes: [
    // ===== TRIGGER - NEW LEAD =====
    {
      id: 'trigger-newLead',
      type: 'trigger',
      position: { x: 400, y: 0 },
      data: {
        label: 'New Lead Added',
        type: 'newLead',
        color: 'bg-green-500',
        config: {
          description: 'Triggered when lead enters from Social Media, Platforms, Digital Ads, or Website Forms'
        }
      }
    },

    // ===== STAGE 1: IMMEDIATE WHATSAPP =====
    {
      id: 'action-whatsapp-1',
      type: 'action',
      position: { x: 400, y: 120 },
      data: {
        label: 'WhatsApp Msg 1 - Welcome',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hello {{firstName}}! 🏠 Thank you for your interest in {{organizationName}}. Are you interested in learning more about our offerings?',
          template: 'welcome_inquiry',
          buttons: [
            { text: 'Yes, Tell me more', payload: 'interested' },
            { text: 'Not right now', payload: 'not_interested' }
          ]
        }
      }
    },

    // ===== CONDITION: RESPONSE CHECK =====
    {
      id: 'condition-response-1',
      type: 'condition',
      position: { x: 400, y: 250 },
      data: {
        label: 'Response Received?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'response',
          operator: '!=',
          value: 'none',
          timeout: { duration: 24, unit: 'hours' }
        }
      }
    },

    // ===== YES BRANCH: INTERESTED =====
    {
      id: 'action-whatsapp-casualty',
      type: 'action',
      position: { x: 150, y: 380 },
      data: {
        label: 'Send Casualty Link & WhatsApp Msg 2A',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Great! 🎉 Here\'s our latest brochure and a link to schedule a {{appointmentLabel}} at your convenience:\n\n📍 View {{catalogLabel}}: {{propertyLink}}\n📅 Schedule {{appointmentLabel}}: {{scheduleLink}}',
          template: 'brochure'
        }
      }
    },

    // ===== NO RESPONSE BRANCH: 24HR WAIT =====
    {
      id: 'delay-24hr',
      type: 'delay',
      position: { x: 650, y: 380 },
      data: {
        label: 'Wait 24 Hours',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 24,
          unit: 'hours'
        }
      }
    },

    // ===== WHATSAPP FOLLOW-UP MSG 2 =====
    {
      id: 'action-whatsapp-2',
      type: 'action',
      position: { x: 650, y: 500 },
      data: {
        label: 'WhatsApp Msg 2 - Follow-up',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hi {{firstName}}, just following up on my earlier message. Would you be interested in scheduling a free {{appointmentLabel}} to see our offerings? We have exciting offers this month! 🏡',
          template: 'follow_up_1'
        }
      }
    },

    // ===== SITE VISIT INTEREST CHECK =====
    {
      id: 'condition-sitevisit',
      type: 'condition',
      position: { x: 400, y: 500 },
      data: {
        label: 'Site Visit Booked?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'siteVisitStatus',
          operator: '==',
          value: 'booked'
        }
      }
    },

    // ===== RESPONSE CHECK 2 =====
    {
      id: 'condition-response-2',
      type: 'condition',
      position: { x: 650, y: 620 },
      data: {
        label: 'Response Received?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'response',
          operator: '!=',
          value: 'none',
          timeout: { duration: 48, unit: 'hours' }
        }
      }
    },

    // ===== AI VOICE CALL (IVR) =====
    {
      id: 'action-ai-call',
      type: 'action',
      position: { x: 650, y: 750 },
      data: {
        label: 'AI Voice Call (IVR System)',
        type: 'aiCall',
        color: 'bg-blue-600',
        config: {
          script: 'lead_qualification',
          maxDuration: 300,
          voiceId: 'professional_male',
          objective: 'Qualify lead interest, understand requirements, attempt to schedule {{appointmentLabel}}'
        }
      }
    },

    // ===== IVR RESPONSE CHECK =====
    {
      id: 'condition-ivr-response',
      type: 'condition',
      position: { x: 650, y: 880 },
      data: {
        label: 'IVR Response?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'callOutcome',
          operator: 'in',
          value: ['interested', 'schedule_visit', 'callback_requested']
        }
      }
    },

    // ===== POSITIVE IVR - SEND BROCHURE =====
    {
      id: 'action-send-brochure',
      type: 'action',
      position: { x: 400, y: 1000 },
      data: {
        label: 'Send Brochure',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Thank you for speaking with us! 📋 As promised, here\'s our detailed brochure with plans, pricing, and details:\n\n{{brochureLink}}',
          template: 'brochure_after_call'
        }
      }
    },

    // ===== FOLLOW-UP DELAY =====
    {
      id: 'delay-followup-24hr',
      type: 'delay',
      position: { x: 400, y: 1120 },
      data: {
        label: 'Wait 24 Hours',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 24,
          unit: 'hours'
        }
      }
    },

    // ===== NEED TO SCHEDULE CHECK =====
    {
      id: 'condition-schedule-needed',
      type: 'condition',
      position: { x: 400, y: 1240 },
      data: {
        label: 'Need to Schedule {{appointmentLabel}}?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'siteVisitStatus',
          operator: '!=',
          value: 'scheduled'
        }
      }
    },

    // ===== HUMAN AGENT MANUAL CALL =====
    {
      id: 'action-human-call',
      type: 'action',
      position: { x: 400, y: 1370 },
      data: {
        label: 'Human Agent Manual Call',
        type: 'humanCall',
        color: 'bg-orange-600',
        config: {
          taskType: 'call_lead',
          title: 'Call lead - Schedule {{appointmentLabel}}',
          assignTo: 'auto',
          priority: 'high',
          notes: 'Schedule {{appointmentLabel}}, address concerns, build rapport',
          description: 'Objective: Convert to {{appointmentLabel}}'
        }
      }
    },

    // ===== CALL OUTCOME CHECK =====
    {
      id: 'condition-call-outcome',
      type: 'condition',
      position: { x: 400, y: 1500 },
      data: {
        label: 'Interest Level?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'interestLevel',
          operator: 'in',
          value: ['high', 'medium']
        }
      }
    },

    // ===== NOT INTERESTED - REMOVE FROM PIPELINE =====
    {
      id: 'action-remove-pipeline',
      type: 'action',
      position: { x: 150, y: 1620 },
      data: {
        label: 'Remove from Active Pipeline',
        type: 'updateStatus',
        color: 'bg-red-500',
        config: {
          status: 'nurture',
          action: 'Move to long-term nurture list'
        }
      }
    },

    // ===== INTERESTED - SCHEDULE SITE VISIT =====
    {
      id: 'action-schedule-visit',
      type: 'action',
      position: { x: 650, y: 1620 },
      data: {
        label: 'Status: {{appointmentLabel}} Scheduled',
        type: 'updateStatus',
        color: 'bg-purple-600',
        config: {
          status: 'site_visit_scheduled',
          assignTo: 'sales_agent'
        }
      }
    },

    // ===== AGENT CONFIRMATION CALL =====
    {
      id: 'action-confirmation-call',
      type: 'action',
      position: { x: 650, y: 1750 },
      data: {
        label: 'Agent Confirmation Call (Same Day)',
        type: 'humanCall',
        color: 'bg-orange-600',
        config: {
          taskType: 'confirm_site_visit',
          title: 'Confirm {{appointmentLabel}} with lead',
          timing: 'same_day',
          priority: 'high',
          notes: 'Confirm time, provide directions, set expectations'
        }
      }
    },

    // ===== 24HR REMINDER =====
    {
      id: 'action-reminder-24hr',
      type: 'action',
      position: { x: 650, y: 1880 },
      data: {
        label: '24hr Reminder WhatsApp',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hi {{firstName}}! 📅 Just a friendly reminder about your {{appointmentLabel}} tomorrow at {{visitTime}}.\n\n📍 Location: {{propertyAddress}}\n🚗 Directions: {{directionsLink}}\n\nLooking forward to meeting you!',
          template: 'visit_reminder_24hr'
        }
      }
    },

    // ===== 2HR REMINDER =====
    {
      id: 'action-reminder-2hr',
      type: 'action',
      position: { x: 650, y: 2010 },
      data: {
        label: '2hr Reminder WhatsApp',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hi {{firstName}}! ⏰ Your {{appointmentLabel}} is in 2 hours at {{visitTime}}. Our representative {{agentName}} will meet you at the location. Call {{agentPhone}} if needed!',
          template: 'visit_reminder_2hr'
        }
      }
    },

    // ===== SITE VISIT HAPPENED CHECK =====
    {
      id: 'condition-visit-happened',
      type: 'condition',
      position: { x: 650, y: 2140 },
      data: {
        label: '{{appointmentLabel}} Happened?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'siteVisitCompleted',
          operator: '==',
          value: true
        }
      }
    },

    // ===== RESCHEDULE OPTION =====
    {
      id: 'condition-reschedule',
      type: 'condition',
      position: { x: 900, y: 2270 },
      data: {
        label: 'Reschedule?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'rescheduleRequested',
          operator: '==',
          value: true
        }
      }
    },

    // ===== SITE VISIT DONE =====
    {
      id: 'action-visit-done',
      type: 'action',
      position: { x: 650, y: 2400 },
      data: {
        label: 'Status: {{appointmentLabel}} Done - Agent Updates CRM',
        type: 'updateStatus',
        color: 'bg-purple-600',
        config: {
          status: 'site_visit_completed',
          action: 'Agent to update CRM with notes and lead rating'
        }
      }
    },

    // ===== ASSIGN TO SALES ADMIN =====
    {
      id: 'action-assign-sales',
      type: 'action',
      position: { x: 650, y: 2530 },
      data: {
        label: 'Assign to Sales Admin - Qualified Lead',
        type: 'assignLead',
        color: 'bg-indigo-600',
        config: {
          assignTo: 'sales_admin',
          leadQuality: 'qualified'
        }
      }
    },

    // ===== POST-VISIT FOLLOW-UP SEQUENCE =====
    {
      id: 'action-post-visit-task',
      type: 'action',
      position: { x: 650, y: 2660 },
      data: {
        label: 'Post-visit Follow-up Required',
        type: 'createTask',
        color: 'bg-blue-500',
        config: {
          task: 'Post-{{appointmentLabel}} follow-up sequence',
          priority: 'high'
        }
      }
    },

    // ===== DAY 1 - THANK YOU MESSAGE =====
    {
      id: 'action-day1-thankyou',
      type: 'action',
      position: { x: 650, y: 2790 },
      data: {
        label: 'Day 1: WhatsApp Thank You Message',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hi {{firstName}}! 🙏 Thank you for your time today. We hope you liked what you saw! If you have any questions about pricing or payment plans, feel free to reach out.\n\nBest regards,\n{{agentName}}',
          template: 'post_visit_thankyou'
        }
      }
    },

    // ===== DAY 2 DELAY =====
    {
      id: 'delay-day2',
      type: 'delay',
      position: { x: 650, y: 2920 },
      data: {
        label: 'Wait 1 Day',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 1,
          unit: 'days'
        }
      }
    },

    // ===== DAY 2 - AGENT CALL =====
    {
      id: 'action-day2-call',
      type: 'action',
      position: { x: 650, y: 3050 },
      data: {
        label: 'Day 2: Agent Call - Discuss Thoughts',
        type: 'humanCall',
        color: 'bg-orange-600',
        config: {
          taskType: 'followup_call',
          title: 'Day 2 Follow-up: Discuss {{appointmentLabel}} thoughts',
          notes: 'Follow up on {{appointmentLabel}}, understand thoughts, address concerns, discuss pricing',
          priority: 'high'
        }
      }
    },

    // ===== DAY 5 DELAY =====
    {
      id: 'delay-day5',
      type: 'delay',
      position: { x: 650, y: 3180 },
      data: {
        label: 'Wait 3 Days',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 3,
          unit: 'days'
        }
      }
    },

    // ===== DAY 5 - SEND PLANS =====
    {
      id: 'action-day5-plans',
      type: 'action',
      position: { x: 650, y: 3310 },
      data: {
        label: 'Day 5: WhatsApp Send Brochure/Plans',
        type: 'whatsapp',
        color: 'bg-green-600',
        config: {
          message: 'Hi {{firstName}}! 📋 As discussed, here are the detailed floor plans and payment schedules for the units you were interested in:\n\n{{documentsLink}}\n\nLet me know if you\'d like to discuss further!',
          template: 'detailed_plans'
        }
      }
    },

    // ===== DAY 7 DELAY =====
    {
      id: 'delay-day7',
      type: 'delay',
      position: { x: 650, y: 3440 },
      data: {
        label: 'Wait 2 Days',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 2,
          unit: 'days'
        }
      }
    },

    // ===== DAY 7 - FINAL CALL =====
    {
      id: 'action-day7-call',
      type: 'action',
      position: { x: 650, y: 3570 },
      data: {
        label: 'Day 7: Agent Call - Address Concerns',
        type: 'humanCall',
        color: 'bg-orange-600',
        config: {
          taskType: 'followup_call',
          title: 'Day 7 Final Call: Address concerns & close',
          notes: 'Address any remaining concerns, discuss special offers, push for decision',
          priority: 'high'
        }
      }
    },

    // ===== LEAD DECIDED CHECK =====
    {
      id: 'condition-lead-decided',
      type: 'condition',
      position: { x: 650, y: 3700 },
      data: {
        label: 'Lead Decided?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'leadDecision',
          operator: 'in',
          value: ['yes', 'no', 'thinking']
        }
      }
    },

    // ===== STILL THINKING - NURTURE =====
    {
      id: 'action-move-nurture',
      type: 'action',
      position: { x: 400, y: 3830 },
      data: {
        label: 'Update: Not Interested - Move to Nurture',
        type: 'updateStatus',
        color: 'bg-gray-500',
        config: {
          status: 'nurture',
          action: 'Long-term follow-up sequence'
        }
      }
    },

    // ===== INTERESTED - NEGOTIATION =====
    {
      id: 'action-negotiation',
      type: 'action',
      position: { x: 900, y: 3830 },
      data: {
        label: 'Status: Negotiation - Discuss Terms',
        type: 'updateStatus',
        color: 'bg-purple-600',
        config: {
          status: 'negotiation',
          action: 'Begin pricing discussion'
        }
      }
    },

    // ===== REVIEW DEAL TERMS =====
    {
      id: 'action-review-terms',
      type: 'action',
      position: { x: 900, y: 3960 },
      data: {
        label: 'Review Deal Terms - Pricing Discussion',
        type: 'createTask',
        color: 'bg-blue-500',
        config: {
          task: 'Review and finalize deal terms',
          assignTo: 'sales_manager'
        }
      }
    },

    // ===== PREPARE DOCUMENTATION =====
    {
      id: 'action-prepare-docs',
      type: 'action',
      position: { x: 900, y: 4090 },
      data: {
        label: 'Prepare Documentation',
        type: 'createTask',
        color: 'bg-blue-500',
        config: {
          task: 'Prepare booking documents and payment schedule',
          assignTo: 'documentation_team'
        }
      }
    },

    // ===== FINAL DECISION CHECK =====
    {
      id: 'condition-final-decision',
      type: 'condition',
      position: { x: 900, y: 4220 },
      data: {
        label: 'Final Decision?',
        type: 'condition',
        color: 'bg-yellow-500',
        config: {
          field: 'finalDecision',
          operator: 'in',
          value: ['closed_won', 'closed_lost', 'hold']
        }
      }
    },

    // ===== ON HOLD - CONTINUE FOLLOW-UP =====
    {
      id: 'action-on-hold',
      type: 'action',
      position: { x: 650, y: 4350 },
      data: {
        label: 'ON HOLD: Continue Regular Follow-ups',
        type: 'updateStatus',
        color: 'bg-yellow-600',
        config: {
          status: 'on_hold',
          action: 'Schedule Day 14 check-in'
        }
      }
    },

    // ===== DAY 14 CHECK-IN =====
    {
      id: 'delay-day14',
      type: 'delay',
      position: { x: 650, y: 4480 },
      data: {
        label: 'Day 14: Check-In',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 14,
          unit: 'days'
        }
      }
    },

    // ===== DAY 21 CHECK-IN =====
    {
      id: 'delay-day21',
      type: 'delay',
      position: { x: 650, y: 4610 },
      data: {
        label: 'Day 21: Check-In',
        type: 'delay',
        color: 'bg-gray-500',
        config: {
          duration: 7,
          unit: 'days'
        }
      }
    },

    // ===== CLOSED LOST =====
    {
      id: 'action-closed-lost',
      type: 'action',
      position: { x: 1150, y: 4350 },
      data: {
        label: 'Status: Closed Lost - Record Reason',
        type: 'updateStatus',
        color: 'bg-red-600',
        config: {
          status: 'closed_lost',
          action: 'Record reason for loss, add to future campaign list'
        }
      }
    },

    // ===== CLOSED WON =====
    {
      id: 'action-closed-won',
      type: 'action',
      position: { x: 1400, y: 4350 },
      data: {
        label: 'Status: Closed Won - Deal Completed',
        type: 'updateStatus',
        color: 'bg-green-600',
        config: {
          status: 'closed_won',
          action: 'Process booking, handover to operations'
        }
      }
    },

    // ===== UPDATE AGENT PERFORMANCE =====
    {
      id: 'action-update-performance',
      type: 'action',
      position: { x: 1150, y: 4500 },
      data: {
        label: 'Update Agent Performance',
        type: 'analytics',
        color: 'bg-indigo-600',
        config: {
          action: 'Log deal outcome to agent performance metrics'
        }
      }
    },

    // ===== ANALYTICS DASHBOARD =====
    {
      id: 'action-analytics',
      type: 'action',
      position: { x: 1150, y: 4630 },
      data: {
        label: 'Analytics Dashboard Update',
        type: 'analytics',
        color: 'bg-indigo-600',
        config: {
          metrics: ['deals_closed', 'conversion_rate', 'revenue_generated', 'agent_ranking']
        }
      }
    },

    // ===== MARK AS DEAD LEAD =====
    {
      id: 'action-dead-lead',
      type: 'action',
      position: { x: 400, y: 3960 },
      data: {
        label: 'Mark as Dead Lead',
        type: 'updateStatus',
        color: 'bg-gray-600',
        config: {
          status: 'dead',
          action: 'Archive lead, exclude from active campaigns'
        }
      }
    }
  ],

  edges: [
    // Trigger → WhatsApp 1
    { id: 'e-trigger-wa1', source: 'trigger-newLead', target: 'action-whatsapp-1' },
    
    // WhatsApp 1 → Response Check
    { id: 'e-wa1-resp1', source: 'action-whatsapp-1', target: 'condition-response-1' },
    
    // Response Yes → Send Casualty
    { id: 'e-resp1-yes', source: 'condition-response-1', target: 'action-whatsapp-casualty', sourceHandle: 'yes' },
    
    // Response No → 24hr Wait
    { id: 'e-resp1-no', source: 'condition-response-1', target: 'delay-24hr', sourceHandle: 'no' },
    
    // 24hr Wait → WhatsApp 2
    { id: 'e-delay-wa2', source: 'delay-24hr', target: 'action-whatsapp-2' },
    
    // Casualty → Site Visit Check
    { id: 'e-casualty-sv', source: 'action-whatsapp-casualty', target: 'condition-sitevisit' },
    
    // WhatsApp 2 → Response Check 2
    { id: 'e-wa2-resp2', source: 'action-whatsapp-2', target: 'condition-response-2' },
    
    // Response 2 No → AI Call
    { id: 'e-resp2-aicall', source: 'condition-response-2', target: 'action-ai-call', sourceHandle: 'no' },
    
    // Response 2 Yes → Site Visit Check
    { id: 'e-resp2-sv', source: 'condition-response-2', target: 'condition-sitevisit', sourceHandle: 'yes' },
    
    // AI Call → IVR Response Check
    { id: 'e-aicall-ivr', source: 'action-ai-call', target: 'condition-ivr-response' },
    
    // IVR Positive → Send Brochure
    { id: 'e-ivr-brochure', source: 'condition-ivr-response', target: 'action-send-brochure', sourceHandle: 'yes' },
    
    // IVR Negative → Human Call
    { id: 'e-ivr-human', source: 'condition-ivr-response', target: 'action-human-call', sourceHandle: 'no' },
    
    // Brochure → Follow-up Delay
    { id: 'e-brochure-delay', source: 'action-send-brochure', target: 'delay-followup-24hr' },
    
    // Follow-up Delay → Schedule Check
    { id: 'e-delay-schedule', source: 'delay-followup-24hr', target: 'condition-schedule-needed' },
    
    // Schedule Needed Yes → Human Call
    { id: 'e-schedule-human', source: 'condition-schedule-needed', target: 'action-human-call', sourceHandle: 'yes' },
    
    // Schedule Needed No → Confirmation Call
    { id: 'e-schedule-confirm', source: 'condition-schedule-needed', target: 'action-confirmation-call', sourceHandle: 'no' },
    
    // Site Visit Booked Yes → Schedule Visit
    { id: 'e-sv-schedule', source: 'condition-sitevisit', target: 'action-schedule-visit', sourceHandle: 'yes' },
    
    // Site Visit Booked No → Continue to Response Check 2
    { id: 'e-sv-continue', source: 'condition-sitevisit', target: 'condition-response-2', sourceHandle: 'no' },
    
    // Human Call → Outcome Check
    { id: 'e-human-outcome', source: 'action-human-call', target: 'condition-call-outcome' },
    
    // Outcome Not Interested → Remove Pipeline
    { id: 'e-outcome-remove', source: 'condition-call-outcome', target: 'action-remove-pipeline', sourceHandle: 'no' },
    
    // Outcome Interested → Schedule Visit
    { id: 'e-outcome-schedule', source: 'condition-call-outcome', target: 'action-schedule-visit', sourceHandle: 'yes' },
    
    // Schedule Visit → Confirmation Call
    { id: 'e-schedvisit-confirm', source: 'action-schedule-visit', target: 'action-confirmation-call' },
    
    // Confirmation → 24hr Reminder
    { id: 'e-confirm-24hr', source: 'action-confirmation-call', target: 'action-reminder-24hr' },
    
    // 24hr Reminder → 2hr Reminder
    { id: 'e-24hr-2hr', source: 'action-reminder-24hr', target: 'action-reminder-2hr' },
    
    // 2hr Reminder → Visit Happened Check
    { id: 'e-2hr-visit', source: 'action-reminder-2hr', target: 'condition-visit-happened' },
    
    // Visit Happened Yes → Visit Done
    { id: 'e-visit-done', source: 'condition-visit-happened', target: 'action-visit-done', sourceHandle: 'yes' },
    
    // Visit Happened No → Reschedule Check
    { id: 'e-visit-resched', source: 'condition-visit-happened', target: 'condition-reschedule', sourceHandle: 'no' },
    
    // Reschedule Yes → Back to Schedule Visit
    { id: 'e-resched-yes', source: 'condition-reschedule', target: 'action-schedule-visit', sourceHandle: 'yes' },
    
    // Reschedule No → Move to Nurture (gave up)
    { id: 'e-resched-no', source: 'condition-reschedule', target: 'action-move-nurture', sourceHandle: 'no' },
    
    // Visit Done → Assign Sales
    { id: 'e-done-assign', source: 'action-visit-done', target: 'action-assign-sales' },
    
    // Assign Sales → Post Visit Task
    { id: 'e-assign-task', source: 'action-assign-sales', target: 'action-post-visit-task' },
    
    // Post Visit → Day 1 Thank You
    { id: 'e-task-day1', source: 'action-post-visit-task', target: 'action-day1-thankyou' },
    
    // Day 1 → Day 2 Delay
    { id: 'e-day1-delay', source: 'action-day1-thankyou', target: 'delay-day2' },
    
    // Day 2 Delay → Day 2 Call
    { id: 'e-delay-day2call', source: 'delay-day2', target: 'action-day2-call' },
    
    // Day 2 Call → Day 5 Delay
    { id: 'e-day2-delay5', source: 'action-day2-call', target: 'delay-day5' },
    
    // Day 5 Delay → Day 5 Plans
    { id: 'e-delay5-plans', source: 'delay-day5', target: 'action-day5-plans' },
    
    // Day 5 Plans → Day 7 Delay
    { id: 'e-plans-delay7', source: 'action-day5-plans', target: 'delay-day7' },
    
    // Day 7 Delay → Day 7 Call
    { id: 'e-delay7-call', source: 'delay-day7', target: 'action-day7-call' },
    
    // Day 7 Call → Lead Decided
    { id: 'e-day7-decided', source: 'action-day7-call', target: 'condition-lead-decided' },
    
    // Lead Not Interested → Move Nurture
    { id: 'e-decided-nurture', source: 'condition-lead-decided', target: 'action-move-nurture', sourceHandle: 'thinking' },
    
    // Lead Interested → Negotiation
    { id: 'e-decided-nego', source: 'condition-lead-decided', target: 'action-negotiation', sourceHandle: 'yes' },
    
    // Lead No → Dead Lead
    { id: 'e-decided-dead', source: 'condition-lead-decided', target: 'action-dead-lead', sourceHandle: 'no' },
    
    // Negotiation → Review Terms
    { id: 'e-nego-terms', source: 'action-negotiation', target: 'action-review-terms' },
    
    // Review Terms → Prepare Docs
    { id: 'e-terms-docs', source: 'action-review-terms', target: 'action-prepare-docs' },
    
    // Prepare Docs → Final Decision
    { id: 'e-docs-final', source: 'action-prepare-docs', target: 'condition-final-decision' },
    
    // Final Hold → On Hold
    { id: 'e-final-hold', source: 'condition-final-decision', target: 'action-on-hold', sourceHandle: 'hold' },
    
    // Final Lost → Closed Lost
    { id: 'e-final-lost', source: 'condition-final-decision', target: 'action-closed-lost', sourceHandle: 'no' },
    
    // Final Won → Closed Won
    { id: 'e-final-won', source: 'condition-final-decision', target: 'action-closed-won', sourceHandle: 'yes' },
    
    // On Hold → Day 14
    { id: 'e-hold-day14', source: 'action-on-hold', target: 'delay-day14' },
    
    // Day 14 → Day 21
    { id: 'e-day14-21', source: 'delay-day14', target: 'delay-day21' },
    
    // Closed Lost → Update Performance
    { id: 'e-lost-perf', source: 'action-closed-lost', target: 'action-update-performance' },
    
    // Closed Won → Update Performance
    { id: 'e-won-perf', source: 'action-closed-won', target: 'action-update-performance' },
    
    // Update Performance → Analytics
    { id: 'e-perf-analytics', source: 'action-update-performance', target: 'action-analytics' }
  ].map(edge => ({
    ...edge,
    type: 'smoothstep',
    animated: true,
    style: { strokeWidth: 2, stroke: '#6366f1' },
    markerEnd: {
      type: 'arrowclosed',
      color: '#6366f1'
    }
  }))
};

module.exports = defaultAutomationTemplate;
