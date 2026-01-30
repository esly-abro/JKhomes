/**
 * AI Intent Analyzer Service
 * Analyzes conversation transcripts to extract customer intents using AI
 * 
 * Features:
 * - Extract intents from conversation transcripts
 * - Identify customer requests (WhatsApp, site visit, callback, etc.)
 * - Determine lead qualification (hot, warm, cold)
 * - Extract entities (dates, times, locations, budget)
 * - Support for multiple languages (English, Tamil, Hindi)
 * 
 * Uses OpenAI GPT-4 for intelligent intent extraction
 */

const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

// Intent types that can be detected
const INTENT_TYPES = {
    SEND_WHATSAPP: 'send_whatsapp',
    BOOK_SITE_VISIT: 'book_site_visit',
    REQUEST_CALLBACK: 'request_callback',
    INTERESTED: 'interested',
    NOT_INTERESTED: 'not_interested',
    NEED_MORE_INFO: 'need_more_info',
    PRICE_INQUIRY: 'price_inquiry',
    LOCATION_INQUIRY: 'location_inquiry',
    SCHEDULE_LATER: 'schedule_later',
    URGENT: 'urgent'
};

// Lead qualification levels
const LEAD_QUALIFICATION = {
    HOT: 'hot',      // Ready to buy/visit immediately
    WARM: 'warm',    // Interested but needs nurturing
    COLD: 'cold',    // Not interested currently
    UNKNOWN: 'unknown'
};

class IntentAnalyzerService {
    constructor() {
        this.apiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY;
        this.model = config.openai?.model || 'gpt-4o-mini';
        this.baseUrl = 'https://api.openai.com/v1';
        
        if (!this.apiKey) {
            logger.warn('OpenAI API key not configured - AI intent analysis disabled');
        } else {
            logger.info('AI Intent Analyzer initialized', { model: this.model });
        }

        // Fallback keywords for when OpenAI is unavailable
        this.fallbackKeywords = {
            whatsapp: ['whatsapp', 'send details', 'send info', 'share on whatsapp', 'message me', 'வாட்ஸ்அப்', 'व्हाट्सएप'],
            siteVisit: ['visit', 'site visit', 'see the property', 'come and see', 'show me', 'schedule visit', 'book visit', 'பார்வை', 'दौरा'],
            callback: ['call back', 'call me later', 'call tomorrow', 'call again', 'திரும்ப அழை', 'वापस कॉल करें'],
            interested: ['interested', 'yes', 'tell me more', 'sounds good', 'okay', 'ஆர்வம்', 'रुचि'],
            notInterested: ['not interested', 'no thanks', 'not now', 'dont call', 'remove', 'வேண்டாம்', 'नहीं']
        };
    }

    /**
     * Analyze conversation transcript to extract intents
     * @param {string|object[]} transcript - Raw transcript or array of messages
     * @param {object} analysis - ElevenLabs analysis object (optional)
     * @param {object} context - Additional context (leadName, propertyInterest, etc.)
     * @returns {Promise<object>} Analysis results with intents, entities, and lead score
     */
    async analyzeConversation(transcript, analysis = null, context = {}) {
        // Convert transcript to string if it's an array
        const transcriptText = this.normalizeTranscript(transcript);

        // First, check ElevenLabs evaluation criteria if available
        const elevenLabsIntents = this.extractFromElevenLabsAnalysis(analysis);

        // If OpenAI is not configured, use fallback + ElevenLabs analysis
        if (!this.apiKey) {
            logger.info('Using fallback intent analysis (OpenAI not configured)');
            const fallbackResult = this.fallbackAnalysis(transcriptText, elevenLabsIntents);
            return fallbackResult;
        }

        try {
            // Use OpenAI for advanced analysis
            const aiResult = await this.analyzeWithOpenAI(transcriptText, context);
            
            // Merge with ElevenLabs evaluation criteria (they take precedence for specific criteria)
            const mergedResult = this.mergeAnalysisResults(aiResult, elevenLabsIntents);
            
            logger.info('AI intent analysis completed', {
                intents: mergedResult.intents.map(i => i.type),
                qualification: mergedResult.leadQualification,
                confidence: mergedResult.overallConfidence
            });

            return mergedResult;

        } catch (error) {
            logger.error('OpenAI analysis failed, using fallback', { error: error.message });
            return this.fallbackAnalysis(transcriptText, elevenLabsIntents);
        }
    }

    /**
     * Analyze transcript using OpenAI GPT-4
     * @private
     */
    async analyzeWithOpenAI(transcriptText, context) {
        const systemPrompt = `You are an expert conversation analyst for a real estate company (JK Construction) in India. 
Analyze the following conversation transcript and extract:

1. INTENTS - What does the customer want? Identify all applicable intents:
   - send_whatsapp: Customer wants details sent via WhatsApp
   - book_site_visit: Customer wants to schedule a property visit
   - request_callback: Customer wants to be called back later
   - interested: Customer shows interest in the property
   - not_interested: Customer is not interested
   - need_more_info: Customer needs more information before deciding
   - price_inquiry: Customer is asking about pricing
   - location_inquiry: Customer is asking about location/directions
   - schedule_later: Customer wants to schedule something for later
   - urgent: Customer indicates urgency (ready to buy soon)

2. ENTITIES - Extract specific information mentioned:
   - preferred_date: Any date mentioned for visits
   - preferred_time: Any time mentioned
   - budget: Budget mentioned (in lakhs/crores)
   - location_preference: Preferred areas/localities
   - property_type: Type of property interested in (flat, villa, plot)
   - family_size: Number of family members (for BHK recommendation)
   - contact_preference: How they want to be contacted

3. LEAD QUALIFICATION:
   - hot: Ready to buy/visit within a week, shows high urgency
   - warm: Interested but needs time, asks detailed questions
   - cold: Not interested or just browsing

4. SENTIMENT: Overall customer sentiment (positive, neutral, negative)

5. KEY CONCERNS: Any objections or concerns the customer mentioned

Respond ONLY with valid JSON in this exact format:
{
  "intents": [{"type": "string", "confidence": 0.0-1.0, "evidence": "quote from transcript"}],
  "entities": {"key": "value"},
  "leadQualification": "hot|warm|cold",
  "sentiment": "positive|neutral|negative",
  "keyConcerns": ["concern1", "concern2"],
  "summary": "Brief summary of customer's needs",
  "recommendedAction": "What action to take next"
}`;

        const userPrompt = `Conversation transcript:
${transcriptText}

${context.leadName ? `Customer Name: ${context.leadName}` : ''}
${context.propertyInterest ? `Property Interest: ${context.propertyInterest}` : ''}

Analyze this conversation and extract intents, entities, and qualification.`;

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            {
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,  // Lower temperature for more consistent analysis
                max_tokens: 1000,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const content = response.data.choices[0].message.content;
        const result = JSON.parse(content);

        // Add metadata
        result.source = 'openai';
        result.model = this.model;
        result.analyzedAt = new Date().toISOString();
        result.overallConfidence = this.calculateOverallConfidence(result.intents);

        return result;
    }

    /**
     * Extract intents from ElevenLabs evaluation criteria
     * @private
     */
    extractFromElevenLabsAnalysis(analysis) {
        if (!analysis) return null;

        const result = {
            intents: [],
            entities: {},
            source: 'elevenlabs'
        };

        // Check evaluation_criteria_results
        if (analysis.evaluation_criteria_results) {
            const criteria = analysis.evaluation_criteria_results;

            // Map ElevenLabs criteria to our intents
            if (criteria['user_interested'] === 'success') {
                result.intents.push({
                    type: INTENT_TYPES.INTERESTED,
                    confidence: 0.95,
                    evidence: 'ElevenLabs evaluation: user_interested = success'
                });
            }

            if (criteria['site_visit_requested'] === 'success') {
                result.intents.push({
                    type: INTENT_TYPES.BOOK_SITE_VISIT,
                    confidence: 0.95,
                    evidence: 'ElevenLabs evaluation: site_visit_requested = success'
                });
            }

            if (criteria['whatsapp_requested'] === 'success' || criteria['send_details_requested'] === 'success') {
                result.intents.push({
                    type: INTENT_TYPES.SEND_WHATSAPP,
                    confidence: 0.95,
                    evidence: 'ElevenLabs evaluation: whatsapp/details requested = success'
                });
            }

            if (criteria['callback_requested'] === 'success') {
                result.intents.push({
                    type: INTENT_TYPES.REQUEST_CALLBACK,
                    confidence: 0.95,
                    evidence: 'ElevenLabs evaluation: callback_requested = success'
                });
            }

            if (criteria['not_interested'] === 'success') {
                result.intents.push({
                    type: INTENT_TYPES.NOT_INTERESTED,
                    confidence: 0.95,
                    evidence: 'ElevenLabs evaluation: not_interested = success'
                });
            }
        }

        // Check data_collection_results for entities
        if (analysis.data_collection_results) {
            const data = analysis.data_collection_results;
            
            if (data.preferred_date) result.entities.preferred_date = data.preferred_date;
            if (data.preferred_time) result.entities.preferred_time = data.preferred_time;
            if (data.budget) result.entities.budget = data.budget;
            if (data.location) result.entities.location_preference = data.location;
            if (data.property_type) result.entities.property_type = data.property_type;
        }

        // Use transcript summary if available
        if (analysis.transcript_summary) {
            result.summary = analysis.transcript_summary;
        }

        // Use call_successful indicator
        if (analysis.call_successful === 'success') {
            result.callSuccessful = true;
        }

        return result.intents.length > 0 ? result : null;
    }

    /**
     * Fallback keyword-based analysis
     * @private
     */
    fallbackAnalysis(transcriptText, elevenLabsIntents) {
        const lowerText = transcriptText.toLowerCase();
        const result = {
            intents: [],
            entities: {},
            leadQualification: LEAD_QUALIFICATION.UNKNOWN,
            sentiment: 'neutral',
            keyConcerns: [],
            summary: '',
            recommendedAction: '',
            source: 'fallback',
            overallConfidence: 0.6
        };

        // Check WhatsApp intent
        if (this.fallbackKeywords.whatsapp.some(kw => lowerText.includes(kw))) {
            result.intents.push({
                type: INTENT_TYPES.SEND_WHATSAPP,
                confidence: 0.75,
                evidence: 'Keyword match: WhatsApp request detected'
            });
        }

        // Check site visit intent
        if (this.fallbackKeywords.siteVisit.some(kw => lowerText.includes(kw))) {
            result.intents.push({
                type: INTENT_TYPES.BOOK_SITE_VISIT,
                confidence: 0.75,
                evidence: 'Keyword match: Site visit request detected'
            });
        }

        // Check callback intent
        if (this.fallbackKeywords.callback.some(kw => lowerText.includes(kw))) {
            result.intents.push({
                type: INTENT_TYPES.REQUEST_CALLBACK,
                confidence: 0.75,
                evidence: 'Keyword match: Callback request detected'
            });
        }

        // Check interest
        if (this.fallbackKeywords.interested.some(kw => lowerText.includes(kw))) {
            result.intents.push({
                type: INTENT_TYPES.INTERESTED,
                confidence: 0.7,
                evidence: 'Keyword match: Interest detected'
            });
            result.leadQualification = LEAD_QUALIFICATION.WARM;
        }

        // Check not interested
        if (this.fallbackKeywords.notInterested.some(kw => lowerText.includes(kw))) {
            result.intents.push({
                type: INTENT_TYPES.NOT_INTERESTED,
                confidence: 0.8,
                evidence: 'Keyword match: Not interested detected'
            });
            result.leadQualification = LEAD_QUALIFICATION.COLD;
        }

        // Merge with ElevenLabs results if available (they take precedence)
        if (elevenLabsIntents) {
            result.intents = this.mergeIntents(elevenLabsIntents.intents, result.intents);
            result.entities = { ...result.entities, ...elevenLabsIntents.entities };
            if (elevenLabsIntents.summary) result.summary = elevenLabsIntents.summary;
        }

        // Determine lead qualification based on intents
        if (result.leadQualification === LEAD_QUALIFICATION.UNKNOWN) {
            result.leadQualification = this.determineQualification(result.intents);
        }

        // Set recommended action
        result.recommendedAction = this.getRecommendedAction(result.intents, result.leadQualification);

        return result;
    }

    /**
     * Merge OpenAI and ElevenLabs analysis results
     * @private
     */
    mergeAnalysisResults(aiResult, elevenLabsIntents) {
        if (!elevenLabsIntents) return aiResult;

        // ElevenLabs evaluation criteria are more reliable for specific intents
        // So we give them priority
        const mergedIntents = this.mergeIntents(elevenLabsIntents.intents, aiResult.intents);
        
        return {
            ...aiResult,
            intents: mergedIntents,
            entities: { ...aiResult.entities, ...elevenLabsIntents.entities },
            summary: elevenLabsIntents.summary || aiResult.summary,
            source: 'merged',
            overallConfidence: Math.max(aiResult.overallConfidence || 0.7, 0.85)
        };
    }

    /**
     * Merge intent arrays, removing duplicates and keeping highest confidence
     * @private
     */
    mergeIntents(primary, secondary) {
        const intentMap = new Map();

        // Add primary intents first (higher priority)
        (primary || []).forEach(intent => {
            intentMap.set(intent.type, intent);
        });

        // Add secondary intents only if not already present
        (secondary || []).forEach(intent => {
            if (!intentMap.has(intent.type)) {
                intentMap.set(intent.type, intent);
            }
        });

        return Array.from(intentMap.values());
    }

    /**
     * Calculate overall confidence score
     * @private
     */
    calculateOverallConfidence(intents) {
        if (!intents || intents.length === 0) return 0.5;
        const sum = intents.reduce((acc, i) => acc + (i.confidence || 0.5), 0);
        return Math.min(sum / intents.length, 1.0);
    }

    /**
     * Determine lead qualification based on intents
     * @private
     */
    determineQualification(intents) {
        const intentTypes = intents.map(i => i.type);

        // Hot: Ready to visit or urgent
        if (intentTypes.includes(INTENT_TYPES.BOOK_SITE_VISIT) || intentTypes.includes(INTENT_TYPES.URGENT)) {
            return LEAD_QUALIFICATION.HOT;
        }

        // Cold: Not interested
        if (intentTypes.includes(INTENT_TYPES.NOT_INTERESTED)) {
            return LEAD_QUALIFICATION.COLD;
        }

        // Warm: Interested or wants more info
        if (intentTypes.includes(INTENT_TYPES.INTERESTED) || 
            intentTypes.includes(INTENT_TYPES.SEND_WHATSAPP) ||
            intentTypes.includes(INTENT_TYPES.NEED_MORE_INFO)) {
            return LEAD_QUALIFICATION.WARM;
        }

        return LEAD_QUALIFICATION.UNKNOWN;
    }

    /**
     * Get recommended action based on analysis
     * @private
     */
    getRecommendedAction(intents, qualification) {
        const intentTypes = intents.map(i => i.type);

        if (intentTypes.includes(INTENT_TYPES.BOOK_SITE_VISIT)) {
            return 'Send site visit booking link via WhatsApp and confirm slot';
        }

        if (intentTypes.includes(INTENT_TYPES.SEND_WHATSAPP)) {
            return 'Send property details and brochure via WhatsApp immediately';
        }

        if (intentTypes.includes(INTENT_TYPES.REQUEST_CALLBACK)) {
            return 'Schedule callback and send confirmation via WhatsApp';
        }

        if (intentTypes.includes(INTENT_TYPES.NOT_INTERESTED)) {
            return 'Mark as cold lead, no immediate follow-up needed';
        }

        if (qualification === LEAD_QUALIFICATION.HOT) {
            return 'High priority - immediate personal follow-up recommended';
        }

        if (qualification === LEAD_QUALIFICATION.WARM) {
            return 'Send property details via WhatsApp, follow up in 2-3 days';
        }

        return 'Review transcript and determine appropriate follow-up';
    }

    /**
     * Normalize transcript to string format
     * @private
     */
    normalizeTranscript(transcript) {
        if (!transcript) return '';
        
        if (typeof transcript === 'string') {
            return transcript;
        }

        // Handle ElevenLabs transcript array format
        if (Array.isArray(transcript)) {
            return transcript.map(turn => {
                const role = turn.role === 'agent' ? 'Agent' : 'Customer';
                return `${role}: ${turn.message || turn.text || ''}`;
            }).join('\n');
        }

        return JSON.stringify(transcript);
    }

    /**
     * Quick check if transcript contains specific intent
     * @param {string} transcript - Conversation transcript
     * @param {string} intentType - Intent type to check
     * @returns {boolean} Whether intent is present
     */
    hasIntent(transcript, intentType) {
        const text = this.normalizeTranscript(transcript).toLowerCase();
        
        switch (intentType) {
            case INTENT_TYPES.SEND_WHATSAPP:
                return this.fallbackKeywords.whatsapp.some(kw => text.includes(kw));
            case INTENT_TYPES.BOOK_SITE_VISIT:
                return this.fallbackKeywords.siteVisit.some(kw => text.includes(kw));
            case INTENT_TYPES.REQUEST_CALLBACK:
                return this.fallbackKeywords.callback.some(kw => text.includes(kw));
            case INTENT_TYPES.INTERESTED:
                return this.fallbackKeywords.interested.some(kw => text.includes(kw));
            case INTENT_TYPES.NOT_INTERESTED:
                return this.fallbackKeywords.notInterested.some(kw => text.includes(kw));
            default:
                return false;
        }
    }

    /**
     * Check if service is available
     * @returns {boolean} Service availability (true even without OpenAI - fallback available)
     */
    isAvailable() {
        return true; // Fallback always available
    }

    /**
     * Check if AI analysis is available (OpenAI configured)
     * @returns {boolean} AI availability
     */
    isAIAvailable() {
        return !!this.apiKey;
    }
}

// Export class, intent types, and qualification levels
module.exports = {
    IntentAnalyzerService: new IntentAnalyzerService(),
    INTENT_TYPES,
    LEAD_QUALIFICATION
};
