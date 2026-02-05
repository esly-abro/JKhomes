/**
 * Encryption Utility
 * AES-256-CBC encryption for sensitive data like API keys
 * 
 * Usage:
 *   const { encrypt, decrypt, encryptField, decryptField } = require('./utils/encryption');
 *   
 *   // Direct encryption
 *   const encrypted = encrypt('my-api-key');
 *   const decrypted = decrypt(encrypted);
 *   
 *   // Mongoose field helpers (for schema setters/getters)
 *   const schema = new mongoose.Schema({
 *     apiKey: {
 *       type: String,
 *       set: encryptField,
 *       get: decryptField
 *     }
 *   });
 */

const crypto = require('crypto');

// Encryption settings
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SALT = 'leadflow-encryption-salt-2026';

// Get encryption key from environment (32 bytes required for AES-256)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    // Use a default key for development (NOT secure for production!)
    console.warn('⚠️  ENCRYPTION_KEY not set! Using default key. Set ENCRYPTION_KEY in .env for production.');
    return crypto.scryptSync('leadflow-default-key-change-me!!', SALT, 32);
  }
  
  // Derive a proper 32-byte key from the environment variable
  return crypto.scryptSync(key, SALT, 32);
};

/**
 * Encrypt a plaintext string
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted string in format: iv:encryptedData
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return iv:encrypted format
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    return text; // Return original on error
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} text - Encrypted string in format: iv:encryptedData
 * @returns {string} Decrypted plain text
 */
function decrypt(text) {
  if (!text || typeof text !== 'string' || !text.includes(':')) return text;
  
  try {
    const [ivHex, encryptedData] = text.split(':');
    
    if (!ivHex || !encryptedData) return text;
    
    const iv = Buffer.from(ivHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return text; // Return original on error
  }
}

/**
 * Mongoose schema setter for encrypted fields
 */
const encryptField = (value) => encrypt(value);

/**
 * Mongoose schema getter for decrypted fields
 */
const decryptField = (value) => decrypt(value);

/**
 * Validate encryption configuration
 * @returns {object} Validation result with isValid and message
 */
function validateEncryptionConfig() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    return {
      isValid: false,
      message: 'ENCRYPTION_KEY not set - using default (not secure for production)'
    };
  }
  
  if (key.length < 16) {
    return {
      isValid: false,
      message: 'ENCRYPTION_KEY should be at least 16 characters for security'
    };
  }
  
  return {
    isValid: true,
    message: 'Encryption properly configured'
  };
}

/**
 * Mask sensitive value for display (e.g., API keys in UI)
 * @param {string} value - Sensitive value to mask
 * @param {number} visibleChars - Number of characters to show at start
 * @returns {string} Masked value like "sk_1234••••••••"
 */
function maskSensitiveValue(value, visibleChars = 8) {
  if (!value || typeof value !== 'string') return '';
  
  // First decrypt if encrypted
  const decrypted = decrypt(value);
  
  if (decrypted.length <= visibleChars) {
    return '•'.repeat(decrypted.length);
  }
  
  return decrypted.substring(0, visibleChars) + '•'.repeat(Math.min(12, decrypted.length - visibleChars));
}

/**
 * Check if a value appears to be encrypted
 * @param {string} value - Value to check
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  
  // Check for iv:encrypted format (hex:hex)
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  
  const [iv, encrypted] = parts;
  
  // IV should be 32 hex chars (16 bytes)
  // Encrypted data should be non-empty hex
  return iv.length === 32 && 
         /^[0-9a-f]+$/i.test(iv) && 
         encrypted.length > 0 && 
         /^[0-9a-f]+$/i.test(encrypted);
}

module.exports = {
  encrypt,
  decrypt,
  encryptField,
  decryptField,
  validateEncryptionConfig,
  maskSensitiveValue,
  isEncrypted,
  ALGORITHM
};
