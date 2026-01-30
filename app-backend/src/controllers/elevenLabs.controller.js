const elevenLabsService = require('../services/elevenLabs.service');

exports.syncHistory = async (req, reply) => {
    try {
        const result = await elevenLabsService.syncConversations();
        return reply.send({
            success: true,
            data: result
        });
    } catch (error) {
        req.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to sync ElevenLabs history'
        });
    }
};
