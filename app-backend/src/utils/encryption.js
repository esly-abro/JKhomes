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
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set in environment. Using default key (NOT SECURE FOR PRODUCTION)');
    return 'leadflow-default-key-change-me!!'; // 32 characters
  }
  
  return key;
};

/**
 * Derive a 32-byte key from the encryption key using scrypt
 * This ensures we always have the correct key length for AES-256
 */
const deriveKey = () => {
  const encryptionKey = getEncryptionKey();
  return crypto.scryptSync(encryptionKey, SALT, 32);
};

/**
 * Encrypt a string using AES-256-CBC
 * @param {string} text - The plaintext to encrypt
 * @returns {string} - The encrypted text in format: iv:encryptedData
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Don't re-encrypt already encrypted values
  if (isEncrypted(text)) {
    return text;
  }
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return format: iv:encryptedData (both in hex)
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decrypt a string that was encrypted with encrypt()
 * @param {string} text - The encrypted text in format: iv:encryptedData
 * @returns {string} - The decrypted plaintext
 */
function decrypt(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Check if the text is actually encrypted
  if (!isEncrypted(text)) {
    return text;
  }
  
  try {
    const [ivHex, encryptedData] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    // Return original text if decryption fails (might be unencrypted legacy data)
    return text;
  }
}

/**
 * Check if a string appears to be encrypted
 * Encrypted values have format: 32-char-hex:hex-data
 * @param {string} text - The text to check
 * @returns {boolean} - True if the text appears to be encrypted
 */
function isEncrypted(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  // Check for format: 32-hex-chars:more-hex-chars
  const parts = text.split(':');
  if (parts.length !== 2) {
    return false;
  }
  
  const [iv, data] = parts;
  
  // IV should be exactly 32 hex characters (16 bytes)
  if (iv.length !== 32) {
    return false;
  }
  
  // Both parts should be valid hex
  const hexRegex = /^[0-9a-fA-F]+$/;
  return hexRegex.test(iv) && hexRegex.test(data) && data.length > 0;
}

/**
 * Mongoose setter function for encrypted fields
 * Use in schema definition: { set: encryptField }
 */
function encryptField(value) {
  return encrypt(value);
}

/**
 * Mongoose getter function for encrypted fields
 * Use in schema definition: { get: decryptField }
 */
function decryptField(value) {
  return decrypt(value);
}

/**
 * Create Mongoose schema field config for an encrypted string
 * @param {object} options - Additional schema options (required, default, etc.)
 * @returns {object} - Schema field configuration with encryption
 */
function encryptedString(options = {}) {
  return {
    type: String,
    set: encryptField,
    get: decryptField,
    ...options
  };
}

/**
 * Generate a secure encryption key
 * Use this to generate a new ENCRYPTION_KEY for production
 * @returns {string} - A 32-character random key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64').slice(0, 32);
}

/**
 * Validate that the encryption key is properly configured
 * @returns {object} - { isValid: boolean, message: string }
 */
function validateEncryptionConfig() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    return {
      isValid: false,
      message: 'ENCRYPTION_KEY not set in environment variables'
    };
  }
  
  if (key === 'leadflow-default-key-change-me!!') {
    return {
      isValid: false,
      message: 'Using default encryption key - must change for production'
    };
  }
  
  if (key.length < 16) {
    return {
      isValid: false,
      message: 'ENCRYPTION_KEY should be at least 16 characters'
    };
  }
  
  return {
    isValid: true,
    message: 'Encryption properly configured'
  };
}

/**
 * Mask a sensitive value for display (show only last 4 chars)
 * @param {string} value - The sensitive value
 * @param {number} showLast - Number of characters to show at the end
 * @returns {string} - Masked value like "••••••••1234"
 */
function maskSensitiveValue(value, showLast = 4) {
  if (!value || typeof value !== 'string') {
    return '••••••••';
  }
  
  // Decrypt if encrypted
  const plainValue = isEncrypted(value) ? decrypt(value) : value;
  
  if (plainValue.length <= showLast) {
    return '••••••••';
  }
  
  const masked = '•'.repeat(8) + plainValue.slice(-showLast);
  return masked;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptField,
  decryptField,
  encryptedString,
  generateEncryptionKey,
  validateEncryptionConfig,
  maskSensitiveValue,
  ALGORITHM,
  IV_LENGTH
};
