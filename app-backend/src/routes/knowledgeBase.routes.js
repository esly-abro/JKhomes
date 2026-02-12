/**
 * Knowledge Base Routes - Public endpoints for ElevenLabs AI to crawl
 * These endpoints return property data in a readable format for AI indexing
 */

const Property = require('../properties/properties.model');

async function knowledgeBaseRoutes(fastify, options) {
  
  /**
   * GET /api/knowledge-base/properties
   * Returns all properties in a readable text format for AI indexing
   * This endpoint is PUBLIC - no authentication required
   */
  fastify.get('/properties', {
    schema: {
      description: 'Get all properties in readable format for AI knowledge base',
      tags: ['Knowledge Base'],
      response: {
        200: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            lastUpdated: { type: 'string' },
            totalProperties: { type: 'number' },
            properties: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Get all properties (don't filter by isActive since it may not be set)
      const properties = await Property.find({})
        .populate('assignedAgent', 'name email phone')
        .lean();

      const formattedProperties = properties.map(prop => {
        const agent = prop.assignedAgent || {};
        const siteVisit = prop.siteVisitAvailability || {};
        // Note: siteVisitAvailability is the property-level scheduling config (kept for backward compat)
        // The label shown to users depends on tenant config appointmentFieldLabel
        let priceRange = 'Price not specified';
        if (prop.priceRange) {
          const min = prop.priceRange.min ? `₹${(prop.priceRange.min / 100000).toFixed(2)} Lakhs` : '';
          const max = prop.priceRange.max ? `₹${(prop.priceRange.max / 100000).toFixed(2)} Lakhs` : '';
          if (min && max) priceRange = `${min} - ${max}`;
          else if (min) priceRange = `Starting from ${min}`;
          else if (max) priceRange = `Up to ${max}`;
        }

        // Format amenities
        const amenities = prop.amenities?.length > 0 
          ? prop.amenities.join(', ') 
          : 'Contact for amenities list';

        // Format available days for site visits
        const availableDays = siteVisit.availableDays?.length > 0
          ? siteVisit.availableDays.join(', ')
          : 'Contact for availability';

        // Format time slots
        const timeSlots = siteVisit.timeSlots?.length > 0
          ? siteVisit.timeSlots.map(slot => `${slot.start} to ${slot.end}`).join(', ')
          : 'Contact for time slots';

        return {
          name: prop.name,
          type: prop.propertyType || 'Property',
          location: prop.location,
          status: prop.status,
          price: priceRange,
          size: prop.size ? `${prop.size} sq.ft` : 'Size not specified',
          bedrooms: prop.bedrooms || 'Not specified',
          bathrooms: prop.bathrooms || 'Not specified',
          description: prop.description || 'Contact for more details',
          amenities: amenities,
          assignedAgent: agent.name || 'JK Homes Team',
          agentPhone: agent.phone || 'Contact office',
          agentEmail: agent.email || 'info@jkhomes.com',
          siteVisitsAvailable: siteVisit.enabled ? 'Yes' : 'No',
          appointmentsAvailable: siteVisit.enabled ? 'Yes' : 'No',
          visitDays: availableDays,
          visitTimeSlots: timeSlots,
          interestedCount: prop.interestedCount || 0
        };
      });

      return {
        title: 'JK Homes - Available Properties',
        company: 'JK Homes Construction',
        lastUpdated: new Date().toISOString(),
        totalProperties: formattedProperties.length,
        properties: formattedProperties
      };
    } catch (error) {
      fastify.log.error('Knowledge base properties error:', error);
      reply.status(500).send({ error: 'Failed to fetch properties' });
    }
  });

  /**
   * GET /api/knowledge-base/properties/text
   * Returns properties as plain text - easier for AI to parse
   */
  fastify.get('/properties/text', async (request, reply) => {
    try {
      // Get all properties (don't filter by isActive since it may not be set)
      const properties = await Property.find({})
        .populate('assignedAgent', 'name email phone')
        .lean();

      let text = `# JK Homes - Property Listings\n`;
      text += `Last Updated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}\n`;
      text += `Total Available Properties: ${properties.length}\n\n`;
      text += `---\n\n`;

      properties.forEach((prop, index) => {
        const agent = prop.assignedAgent || {};
        const siteVisit = prop.siteVisitAvailability || {};
        
        // Format price
        let priceRange = 'Contact for pricing';
        if (prop.priceRange?.min || prop.priceRange?.max) {
          const min = prop.priceRange.min ? `₹${(prop.priceRange.min / 100000).toFixed(2)} Lakhs` : '';
          const max = prop.priceRange.max ? `₹${(prop.priceRange.max / 100000).toFixed(2)} Lakhs` : '';
          if (min && max) priceRange = `${min} to ${max}`;
          else priceRange = min || max;
        }

        text += `## Property ${index + 1}: ${prop.name}\n\n`;
        text += `**Type:** ${prop.propertyType || 'Property'}\n`;
        text += `**Location:** ${prop.location}\n`;
        text += `**Status:** ${prop.status}\n`;
        text += `**Price Range:** ${priceRange}\n`;
        
        if (prop.size) {
          const sizeValue = typeof prop.size === 'object' ? (prop.size.value || prop.size.min || JSON.stringify(prop.size)) : prop.size;
          text += `**Size:** ${sizeValue} square feet\n`;
        }
        if (prop.bedrooms) text += `**Bedrooms:** ${prop.bedrooms}\n`;
        if (prop.bathrooms) text += `**Bathrooms:** ${prop.bathrooms}\n`;
        
        if (prop.description) {
          text += `\n**Description:**\n${prop.description}\n`;
        }
        
        if (prop.amenities?.length > 0) {
          text += `\n**Amenities:** ${prop.amenities.join(', ')}\n`;
        }

        text += `\n**Contact Information:**\n`;
        text += `- Agent: ${agent.name || 'JK Homes Team'}\n`;
        text += `- Phone: ${agent.phone || 'Contact office'}\n`;
        text += `- Email: ${agent.email || 'info@jkhomes.com'}\n`;

        if (siteVisit.enabled) {
          text += `\n**Appointment/Visit Availability:**\n`;
          text += `- Available Days: ${siteVisit.availableDays?.join(', ') || 'Contact for schedule'}\n`;
          if (siteVisit.timeSlots?.length > 0) {
            const slots = siteVisit.timeSlots.map(s => `${s.start}-${s.end}`).join(', ');
            text += `- Time Slots: ${slots}\n`;
          }
          text += `- To book an appointment, call us or use our booking system.\n`;
        }

        text += `\n---\n\n`;
      });

      text += `\n## About JK Homes\n\n`;
      text += `JK Homes is a trusted construction and real estate company. `;
      text += `We offer premium residential properties including villas, apartments, and plots. `;
      text += `Contact us to schedule an appointment or learn more about our properties.\n\n`;
      text += `**Office Contact:** info@jkhomes.com\n`;

      reply.type('text/plain; charset=utf-8').send(text);
    } catch (error) {
      fastify.log.error('Knowledge base text error:', error);
      reply.status(500).send('Failed to fetch properties');
    }
  });

  /**
   * GET /api/knowledge-base/summary
   * Quick summary for AI context
   */
  fastify.get('/summary', async (request, reply) => {
    try {
      // Get all properties (don't filter by isActive since it may not be set)
      const properties = await Property.find({}).lean();
      
      const byStatus = {};
      const byType = {};
      const locations = new Set();
      
      properties.forEach(p => {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        byType[p.propertyType] = (byType[p.propertyType] || 0) + 1;
        if (p.location) locations.add(p.location);
      });

      return {
        company: 'JK Homes Construction',
        totalProperties: properties.length,
        byStatus,
        byType,
        locations: Array.from(locations),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      reply.status(500).send({ error: 'Failed to fetch summary' });
    }
  });
}

module.exports = knowledgeBaseRoutes;
