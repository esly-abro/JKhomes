const User = require('../models/User');
const leadsService = require('../leads/leads.service');
const propertiesService = require('../properties/properties.service');

class AssignmentService {
  async assignLeads(leadIds, agentId, assignedBy, autoAssign = false) {
    try {
      const results = [];

      for (const leadId of leadIds) {
        try {
          let targetAgentId = agentId;

          // If auto-assign is enabled and no specific agent provided
          if (autoAssign && !agentId) {
            const lead = await leadsService.getLeadById(leadId);
            targetAgentId = await this.findBestAgent(lead);
          }

          // Use the new assignLeadToAgent function that properly updates MongoDB
          const result = await leadsService.assignLeadToAgent(leadId, targetAgentId, assignedBy);

          results.push({
            leadId,
            success: true,
            assignedTo: targetAgentId,
            agentName: result.agentName
          });
        } catch (error) {
          results.push({
            leadId,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Assign leads error:', error);
      throw error;
    }
  }

  async findBestAgent(lead) {
    try {
      console.log('\n========== AUTO-ASSIGN DEBUG ==========');
      console.log('Lead being assigned:', {
        id: lead.id || lead._id,
        name: lead.name,
        value: lead.value,
        propertyId: lead.propertyId,
        location: lead.location
      });

      // Get all active agents (role: agent or bpo)
      const agents = await User.find({
        role: { $in: ['agent', 'bpo'] }
      });

      console.log(`Found ${agents.length} agents:`, agents.map(a => ({ id: a._id, name: a.name || a.email })));

      if (agents.length === 0) {
        console.log('❌ NO AGENTS AVAILABLE');
        throw new Error('No agents available for assignment');
      }

      // Get current workload for each agent
      const agentWorkload = await Promise.all(
        agents.map(async (agent) => {
          const activeLeads = await leadsService.getLeadsByOwner(agent._id.toString());
          const activeCount = activeLeads.filter(
            l => !['Not Interested'].includes(l.status)
          ).length;

          return {
            agentId: agent._id.toString(),
            agentName: agent.name || agent.email,
            activeLeads: activeCount,
            totalLeads: activeLeads.length
          };
        })
      );

      // Sort by active leads (ascending) - agents with fewer leads get priority
      agentWorkload.sort((a, b) => a.activeLeads - b.activeLeads);

      console.log('Agent Workload (sorted by active leads):');
      agentWorkload.forEach((w, i) => {
        console.log(`  ${i + 1}. ${w.agentName}: ${w.activeLeads} active / ${w.totalLeads} total`);
      });

      // Priority 1: High-value leads (budget > 5000000) go to least busy agent
      if (lead.value && lead.value > 5000000) {
        console.log(`✅ RULE TRIGGERED: High-Value Lead (${lead.value} > 5,000,000)`);
        console.log(`   → Assigning to: ${agentWorkload[0].agentName} (least busy)`);
        console.log('========================================\n');
        return agentWorkload[0].agentId;
      } else {
        console.log(`ℹ️ High-Value Rule: SKIPPED (value=${lead.value || 'not set'})`);
      }

      // Priority 2: Category matching (if lead has property)
      if (lead.propertyId) {
        console.log(`ℹ️ Checking Category Expertise (propertyId: ${lead.propertyId})`);
        const property = await propertiesService.getPropertyById(lead.propertyId);
        console.log(`   Category: ${property?.category || property?.propertyType || 'NOT SET'}`);

        // Find agent with experience in this category (based on past leads)
        for (const agentData of agentWorkload) {
          const agentLeads = await leadsService.getLeadsByOwner(agentData.agentId);
          const categoryMatch = agentLeads.some(
            l => l.propertyId && (l.category || l.propertyType) === (property?.category || property?.propertyType)
          );

          console.log(`   ${agentData.agentName}: categoryMatch=${categoryMatch}, activeLeads=${agentData.activeLeads}`);

          if (categoryMatch && agentData.activeLeads < 10) {
            console.log(`✅ RULE TRIGGERED: Category Expertise Match`);
            console.log(`   → Assigning to: ${agentData.agentName}`);
            console.log('========================================\n');
            return agentData.agentId;
          }
        }
        console.log('   No category expertise match found');
      } else {
        console.log(`ℹ️ Property Expertise Rule: SKIPPED (no propertyId on lead)`);
      }

      // Priority 3: Location matching
      if (lead.location) {
        console.log(`ℹ️ Checking Location Expertise (location: ${lead.location})`);

        for (const agentData of agentWorkload) {
          const agentLeads = await leadsService.getLeadsByOwner(agentData.agentId);
          const locationMatch = agentLeads.some(
            l => l.location && l.location.toLowerCase().includes(lead.location.toLowerCase())
          );

          console.log(`   ${agentData.agentName}: locationMatch=${locationMatch}, activeLeads=${agentData.activeLeads}`);

          if (locationMatch && agentData.activeLeads < 10) {
            console.log(`✅ RULE TRIGGERED: Location Expertise Match`);
            console.log(`   → Assigning to: ${agentData.agentName}`);
            console.log('========================================\n');
            return agentData.agentId;
          }
        }
        console.log('   No location expertise match found');
      } else {
        console.log(`ℹ️ Location Expertise Rule: SKIPPED (no location on lead)`);
      }

      // Default: Round-robin (agent with least active leads)
      console.log(`✅ RULE TRIGGERED: Round Robin (Fallback)`);
      console.log(`   → Assigning to: ${agentWorkload[0].agentName} (${agentWorkload[0].activeLeads} active leads)`);
      console.log('========================================\n');
      return agentWorkload[0].agentId;
    } catch (error) {
      console.error('❌ Find best agent error:', error);
      // Fallback: return first available agent
      const agents = await User.find({ role: { $in: ['agent', 'bpo'] } }).limit(1);
      if (!agents || agents.length === 0) {
        console.error('❌ CRITICAL: No agents available even for fallback');
        throw new Error('No agents available for assignment');
      }
      console.log(`   Fallback agent: ${agents[0]?.name || agents[0]?.email}`);
      return agents[0]._id.toString();
    }
  }

  async getAgentWorkload() {
    try {
      const agents = await User.find({
        role: { $in: ['agent', 'bpo', 'manager'] }
      });

      const workload = await Promise.all(
        agents.map(async (agent) => {
          const leads = await leadsService.getLeadsByOwner(agent._id.toString());

          const activeLeads = leads.filter(
            l => !['Not Interested'].includes(l.status)
          );

          const closedDeals = leads.filter(l => l.status === 'Interested');

          return {
            agentId: agent._id,
            name: agent.name || agent.email.split('@')[0],
            email: agent.email,
            role: agent.role,
            totalLeads: leads.length,
            activeLeads: activeLeads.length,
            closedDeals: closedDeals.length,
            conversionRate: leads.length > 0
              ? ((closedDeals.length / leads.length) * 100).toFixed(1)
              : '0.0'
          };
        })
      );

      return workload.sort((a, b) => b.activeLeads - a.activeLeads);
    } catch (error) {
      console.error('Get agent workload error:', error);
      throw error;
    }
  }

  async reassignLeads(fromAgentId, toAgentId, leadIds = null) {
    try {
      let leadsToReassign;

      if (leadIds && leadIds.length > 0) {
        // Reassign specific leads
        leadsToReassign = leadIds;
      } else {
        // Reassign all active leads from agent
        const allLeads = await leadsService.getLeadsByOwner(fromAgentId);
        leadsToReassign = allLeads
          .filter(l => !['Not Interested'].includes(l.status))
          .map(l => l.id);
      }

      const results = await this.assignLeads(leadsToReassign, toAgentId, null, false);

      return {
        reassigned: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      console.error('Reassign leads error:', error);
      throw error;
    }
  }
}

module.exports = new AssignmentService();
