/**
 * AI Call Webhook Routes
 * Handles callbacks from ElevenLabs AI conversations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const zohoClient = require('../services/zohoClient');

/**
 * POST /ai-call-webhook
 * Receive AI conversation results from ElevenLabs/Twilio
 */
router.post('/ai-call-webhook', async (req, res) => {
    try {
        const {
            CallSid,
            CallStatus,
            From,
            To,
            Duration,
            RecordingUrl,
            // Custom parameters passed during call
            lead_id,
            lead_name,
            lead_source
        } = req.body;

        logger.info('AI call webhook received', {
            callSid: CallSid,
            status: CallStatus,
            from: From,
            duration: Duration,
            leadId: lead_id
        });

        // Handle different call statuses
        if (CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'no-answer' || CallStatus === 'failed') {
            // Call ended - process results
            await processCallResults({
                callSid: CallSid,
                status: CallStatus,
                phoneNumber: From,
                duration: Duration,
                recordingUrl: RecordingUrl,
                leadId: lead_id,
                leadName: lead_name
            });
        }

        res.status(200).send('OK');

    } catch (error) {
        logger.error('AI webhook processing failed', {
            error: error.message,
            body: req.body
        });
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * POST /ai-conversation-webhook
 * Receive detailed conversation analysis from ElevenLabs
 * This includes transcript, sentiment, booking status, etc.
 */
router.post('/ai-conversation-webhook', async (req, res) => {
    try {
        const {
            conversation_id,
            agent_id,
            transcript,
            duration_seconds,
            custom_data,
            analysis
        } = req.body;

        logger.info('AI conversation webhook received', {
            conversationId: conversation_id,
            duration: duration_seconds,
            hasTranscript: !!transcript
        });

        // Extract booking information from conversation
        const bookingInfo = extractBookingInfo(transcript, analysis);

        // Update Zoho CRM with conversation results
        if (custom_data?.lead_id) {
            await updateLeadFromConversation(custom_data.lead_id, {
                transcript,
                analysis,
                bookingInfo,
                duration: duration_seconds
            });

            // ALSO update app-backend directly for instant UI update
            await updateAppBackend(custom_data.lead_id, {
                transcript,
                analysis,
                bookingInfo,
                duration: duration_seconds
            });
        }

        res.status(200).json({ success: true });

    } catch (error) {
        logger.error('AI conversation webhook failed', {
            error: error.message
        });
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * Process call results and update Zoho CRM
 * @private
 */
async function processCallResults(callData) {
    try {
        const { callSid, status, phoneNumber, duration, recordingUrl, leadId } = callData;

        // Search for lead by phone number if leadId not provided
        let lead = null;
        if (leadId) {
            // Lead ID provided, use it directly
            lead = { id: leadId };
        } else {
            // Search by phone number
            lead = await zohoClient.searchLeadsByPhone(phoneNumber);
        }

        if (!lead) {
            logger.warn('Lead not found for AI call result', { phoneNumber });
            return;
        }

        // Prepare update data based on call status
        const updateData = {
            AI_Call_Status: status,
            AI_Call_Duration: duration,
            Last_AI_Call_Date: new Date().toISOString(),
            AI_Call_Recording_URL: recordingUrl
        };

        // Update call status description
        if (status === 'completed') {
            updateData.Lead_Status = 'AI Call Completed';
            updateData.Description = `AI call completed. Duration: ${duration}s. Recording available.`;
        } else if (status === 'busy') {
            updateData.Lead_Status = 'Busy - Retry Later';
            updateData.Description = 'Line was busy during AI call attempt.';
        } else if (status === 'no-answer') {
            updateData.Lead_Status = 'No Answer - Follow Up';
            updateData.Description = 'No answer during AI call attempt.';
        } else if (status === 'failed') {
            updateData.Lead_Status = 'Call Failed';
            updateData.Description = 'AI call attempt failed.';
        }

        // Update lead in Zoho
        await zohoClient.updateLead(lead.id, updateData);

        logger.info('Lead updated with AI call results', {
            leadId: lead.id,
            status,
            duration
        });

    } catch (error) {
        logger.error('Failed to process AI call results', {
            error: error.message,
            callData
        });
    }
}

/**
 * Update lead based on conversation analysis
 * @private
 */
async function updateLeadFromConversation(leadId, conversationData) {
    try {
        const { transcript, analysis, bookingInfo, duration, phoneNumber } = conversationData;
        const twilioService = require('../services/twilioElevenLabsService');

        const updateData = {
            AI_Call_Transcript: transcript?.substring(0, 32000), // Zoho field limit
            AI_Call_Duration: duration,
            AI_Conversation_Sentiment: analysis?.sentiment || 'neutral',
            Last_AI_Call_Date: new Date().toISOString()
        };

        // ---------------------------------------------------------
        // AUTOMATION LOGIC VIA EVALUATION CRITERIA
        // ---------------------------------------------------------

        let statusUpdated = false;

        // 1. Check Evaluation Criteria if available (More robust)
        if (analysis?.evaluation_criteria_results) {

            // CRITERIA: user_interested
            if (analysis.evaluation_criteria_results['user_interested'] === 'success') {
                updateData.Lead_Status = 'Interested';
                updateData.Description = 'AI detected high interest from customer.';
                statusUpdated = true;
                logger.info('🤖 Automating: Marked lead as Interested');
            }

            // CRITERIA: site_visit_requested
            if (analysis.evaluation_criteria_results['site_visit_requested'] === 'success') {
                updateData.Lead_Status = 'Site Visit Booked';
                updateData.Description = 'Customer requested a site visit. Booking link sent.';
                statusUpdated = true;

                logger.info('🤖 Automating: Site Visit Requested');

                // SEND BOOKING LINK SMS
                if (phoneNumber) {
                    const bookingLink = 'https://jkconstruction.com/book-visit?id=' + leadId;
                    const smsMessage = `Hello from JK Construction! 🏠\n\nPlease use this link to confirm your site visit slot: ${bookingLink}\n\nThank you!`;

                    await twilioService.sendSms(phoneNumber, smsMessage);
                    logger.info('✅ Booking link SMS sent to customer');
                }
            }
        }

        // 2. Fallback to Keyword Extraction if no criteria matched
        if (!statusUpdated) {
            if (bookingInfo.siteVisitBooked) {
                updateData.Lead_Status = 'Site Visit Scheduled';
                updateData.Site_Visit_Date = bookingInfo.visitDate;
                updateData.Site_Visit_Time = bookingInfo.visitTime;
                updateData.Preferred_Location = bookingInfo.location;

            } else if (bookingInfo.interested) {
                updateData.Lead_Status = 'Interested - Follow Up';
                updateData.Follow_Up_Notes = bookingInfo.notes || 'Showed interest but did not book immediately';

            } else if (bookingInfo.notInterested) {
                updateData.Lead_Status = 'Not Interested';
            } else {
                updateData.Lead_Status = 'AI Call Completed - Review Needed';
            }
        }

        // Add lead quality score if available
        if (analysis?.leadScore) {
            updateData.Lead_Quality_Score = analysis.leadScore;
        }

        // Update lead in Zoho
        await zohoClient.updateLead(leadId, updateData);

        logger.info('Lead updated with AI conversation analysis', {
            leadId,
            status: updateData.Lead_Status,
            criteriaResults: analysis?.evaluation_criteria_results
        });

    } catch (error) {
        logger.error('Failed to update lead from conversation', {
            error: error.message,
            leadId
        });
    }
}

/**
 * Extract booking information from transcript
 * @private
 */
function extractBookingInfo(transcript, analysis) {
    // Simple keyword-based extraction
    // In production, use NLP or ElevenLabs built-in intent detection

    const lowerTranscript = (transcript || '').toLowerCase();

    const bookingInfo = {
        siteVisitBooked: false,
        interested: false,
        notInterested: false,
        visitDate: null,
        visitTime: null,
        location: null,
        budget: null,
        propertyType: null,
        preferredContact: null,
        notes: '',
        reason: ''
    };

    // Check for site visit booking
    const bookingKeywords = ['schedule', 'book', 'visit', 'appointment', 'confirmed', 'முன்பதிவு', 'பார்வை'];
    const hasBooking = bookingKeywords.some(keyword => lowerTranscript.includes(keyword));

    if (hasBooking && analysis?.intent === 'book_site_visit') {
        bookingInfo.siteVisitBooked = true;
        // Extract date/time if available in analysis
        if (analysis.entities?.date) {
            bookingInfo.visitDate = analysis.entities.date;
        }
        if (analysis.entities?.time) {
            bookingInfo.visitTime = analysis.entities.time;
        }
    }

    // Check for interest
    const interestKeywords = ['interested', 'information', 'details', 'whatsapp', 'email', 'ஆர்வம்'];
    const hasInterest = interestKeywords.some(keyword => lowerTranscript.includes(keyword));

    if (hasInterest && !bookingInfo.siteVisitBooked) {
        bookingInfo.interested = true;
    }

    // Check for not interested
    const notInterestedKeywords = ['not interested', 'no thanks', 'not now', 'வேண்டாம்', 'இல்லை'];
    const notInterested = notInterestedKeywords.some(keyword => lowerTranscript.includes(keyword));

    if (notInterested) {
        bookingInfo.notInterested = true;
    }

    // Extract property preferences from analysis
    if (analysis?.entities) {
        bookingInfo.location = analysis.entities.location || null;
        bookingInfo.budget = analysis.entities.budget || null;
        bookingInfo.propertyType = analysis.entities.property_type || null;
    }

    return bookingInfo;
}

module.exports = router;
