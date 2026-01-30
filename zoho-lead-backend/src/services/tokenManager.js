/**
 * Token Manager Service
 * Handles Zoho OAuth token refresh and caching
 * 
 * CRITICAL: Automatically refreshes access tokens and handles expiry
 */

const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class TokenManager {
    constructor() {
        this.accessToken = null;
        this.expiresAt = null;  // Timestamp when token expires
        this.refreshToken = config.zoho.refreshToken;
        this.isRefreshing = false;  // Prevent concurrent refreshes
        this.refreshPromise = null;  // Store ongoing refresh promise
    }

    /**
     * Get a valid access token
     * Refreshes automatically if expired or missing
     * @returns {Promise<string>} Valid access token
     */
    async getAccessToken() {
        // If token exists and is valid, return it
        if (this.isTokenValid()) {
            logger.debug('Using cached access token');
            return this.accessToken;
        }

        // If already refreshing, wait for that to complete
        if (this.isRefreshing) {
            logger.debug('Token refresh in progress, waiting...');
            return this.refreshPromise;
        }

        // Refresh the token
        return this.refreshAccessToken();
    }

    /**
     * Check if current access token is still valid
     * @returns {boolean}
     */
    isTokenValid() {
        if (!this.accessToken || !this.expiresAt) {
            return false;
        }

        // Add 60 second buffer before actual expiry
        const now = Date.now();
        const bufferMs = 60 * 1000;

        return (this.expiresAt - now) > bufferMs;
    }

    /**
     * Refresh the access token using refresh_token
     * @returns {Promise<string>} New access token
     */
    async refreshAccessToken() {
        // Prevent concurrent refresh requests
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        this.isRefreshing = true;
        logger.info('Refreshing Zoho access token...');

        this.refreshPromise = this._performTokenRefresh()
            .finally(() => {
                this.isRefreshing = false;
                this.refreshPromise = null;
            });

        return this.refreshPromise;
    }

    /**
     * Internal method to perform the actual token refresh
     * @private
     */
    async _performTokenRefresh() {
        try {
            const tokenUrl = `${config.zoho.accountsUrl}/oauth/v2/token`;

            const params = new URLSearchParams({
                refresh_token: this.refreshToken,
                client_id: config.zoho.clientId,
                client_secret: config.zoho.clientSecret,
                grant_type: 'refresh_token'
            });

            logger.debug(`Token refresh request to: ${tokenUrl}`);

            const response = await axios.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000  // 10 second timeout
            });

            const { access_token, expires_in } = response.data;

            if (!access_token) {
                throw new Error('No access_token received from Zoho');
            }

            // Cache the new token
            this.accessToken = access_token;

            // Calculate expiry time (expires_in is in seconds)
            // Default to 3600 seconds (1 hour) if not provided
            const expiresInMs = (expires_in || 3600) * 1000;
            this.expiresAt = Date.now() + expiresInMs;

            logger.info('Access token refreshed successfully', {
                expiresIn: `${expires_in || 3600} seconds`
            });

            return this.accessToken;

        } catch (error) {
            logger.error('Failed to refresh access token', {
                error: error.message,
                response: error.response?.data
            });

            // Clear invalid token
            this.accessToken = null;
            this.expiresAt = null;

            throw new Error(
                `Token refresh failed: ${error.response?.data?.error || error.message}`
            );
        }
    }

    /**
     * Force clear the cached token
     * Useful for testing or handling specific error scenarios
     */
    clearToken() {
        logger.info('Clearing cached access token');
        this.accessToken = null;
        this.expiresAt = null;
    }

    /**
     * Get token info for debugging
     * @returns {Object}
     */
    getTokenInfo() {
        return {
            hasToken: !!this.accessToken,
            isValid: this.isTokenValid(),
            expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
            timeUntilExpiry: this.expiresAt ? Math.max(0, this.expiresAt - Date.now()) : 0
        };
    }
}

// Export singleton instance
module.exports = new TokenManager();
