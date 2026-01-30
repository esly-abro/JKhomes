/**
 * Broadcast Routes
 * API endpoints for WhatsApp broadcast campaigns
 */

const broadcastController = require('../controllers/broadcast.controller');

async function broadcastRoutes(fastify, options) {
  // Get all broadcasts
  fastify.get('/', broadcastController.getBroadcasts);
  
  // Get target leads count (for preview before sending)
  fastify.get('/leads-count', broadcastController.getTargetLeadsCount);
  
  // Get single broadcast
  fastify.get('/:id', broadcastController.getBroadcastById);
  
  // Get broadcast delivery status
  fastify.get('/:id/status', broadcastController.getBroadcastStatus);
  
  // Create new broadcast
  fastify.post('/', broadcastController.createBroadcast);
  
  // Update broadcast (draft only)
  fastify.patch('/:id', broadcastController.updateBroadcast);
  
  // Delete broadcast
  fastify.delete('/:id', broadcastController.deleteBroadcast);
  
  // Duplicate broadcast
  fastify.post('/:id/duplicate', broadcastController.duplicateBroadcast);
  
  // Send broadcast to all leads
  fastify.post('/:id/send', broadcastController.sendBroadcast);
}

module.exports = broadcastRoutes;
