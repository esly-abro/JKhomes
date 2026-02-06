/**
 * Upload Routes
 * Handles file uploads for properties
 */

const path = require('path');
const fs = require('fs');
const util = require('util');
const { pipeline } = require('stream');
const pump = util.promisify(pipeline);

async function uploadRoutes(fastify, options) {
    // Register multipart support
    await fastify.register(require('@fastify/multipart'), {
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB limit
            files: 10 // Max 10 files per request
        }
    });

    /**
     * Upload property image
     * POST /api/upload/property-image
     */
    fastify.post('/property-image', async (request, reply) => {
        try {
            const data = await request.file();

            if (!data) {
                return reply.code(400).send({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            // Validate file type
            const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedMimes.includes(data.mimetype)) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.'
                });
            }

            // Generate unique filename
            const timestamp = Date.now();
            const ext = path.extname(data.filename);
            const filename = `property-${timestamp}${ext}`;
            const uploadPath = path.join(__dirname, '../../uploads/properties', filename);

            // Ensure directory exists
            const dir = path.dirname(uploadPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Save file
            await pump(data.file, fs.createWriteStream(uploadPath));

            // Return URL
            const imageUrl = `/uploads/properties/${filename}`;

            return reply.send({
                success: true,
                url: imageUrl,
                filename: filename
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to upload image'
            });
        }
    });

    /**
     * Upload avatar image
     * POST /api/upload/avatar
     */
    fastify.post('/avatar', async (request, reply) => {
        try {
            const data = await request.file();

            if (!data) {
                return reply.code(400).send({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            // Validate file type
            const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedMimes.includes(data.mimetype)) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.'
                });
            }

            // Generate unique filename
            const timestamp = Date.now();
            const ext = path.extname(data.filename);
            const filename = `avatar-${timestamp}${ext}`;
            const uploadPath = path.join(__dirname, '../../uploads/avatars', filename);

            // Ensure directory exists
            const dir = path.dirname(uploadPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Save file
            await pump(data.file, fs.createWriteStream(uploadPath));

            // Return URL
            const imageUrl = `/uploads/avatars/${filename}`;

            return reply.send({
                success: true,
                url: imageUrl
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to upload avatar'
            });
        }
    });

    /**
     * Delete property image
     * DELETE /api/upload/property-image/:filename
     */
    fastify.delete('/property-image/:filename', async (request, reply) => {
        try {
            const { filename } = request.params;
            const filePath = path.join(__dirname, '../../uploads/properties', filename);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return reply.code(404).send({
                    success: false,
                    error: 'File not found'
                });
            }

            // Delete file
            fs.unlinkSync(filePath);

            return reply.send({
                success: true,
                message: 'Image deleted successfully'
            });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to delete image'
            });
        }
    });
}

module.exports = uploadRoutes;
