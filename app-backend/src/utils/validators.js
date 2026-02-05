/**
 * Common Validators
 * Pure validation functions for reuse across the application
 */

// ================================
// PHONE VALIDATION
// ================================

const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;
const INDIAN_PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/;

/**
 * Validate phone number (international format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone is valid
 */
function isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return PHONE_REGEX.test(cleaned);
}

/**
 * Validate Indian phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone is valid
 */
function isValidIndianPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return INDIAN_PHONE_REGEX.test(cleaned);
}

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Phone number to normalize
 * @param {string} defaultCountryCode - Default country code (default: +91)
 * @returns {string} Normalized phone number
 */
function normalizePhone(phone, defaultCountryCode = '+91') {
    if (!phone) return null;
    
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
    
    // Add country code if not present
    if (!cleaned.startsWith('+')) {
        cleaned = defaultCountryCode + cleaned;
    }
    
    return cleaned;
}

// ================================
// EMAIL VALIDATION
// ================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email.trim());
}

/**
 * Normalize email (lowercase, trim)
 * @param {string} email - Email to normalize
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
    if (!email) return null;
    return email.trim().toLowerCase();
}

// ================================
// ID VALIDATION
// ================================

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate MongoDB ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean} Whether ID is valid
 */
function isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return OBJECT_ID_REGEX.test(id);
}

/**
 * Validate UUID
 * @param {string} id - ID to validate
 * @returns {boolean} Whether ID is valid UUID
 */
function isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    return UUID_REGEX.test(id);
}

// ================================
// STRING VALIDATION
// ================================

/**
 * Check if string is empty (null, undefined, or whitespace only)
 * @param {string} str - String to check
 * @returns {boolean} Whether string is empty
 */
function isEmpty(str) {
    return str === null || str === undefined || (typeof str === 'string' && str.trim() === '');
}

/**
 * Check if string has minimum length
 * @param {string} str - String to check
 * @param {number} minLength - Minimum length
 * @returns {boolean} Whether string meets minimum length
 */
function hasMinLength(str, minLength) {
    if (isEmpty(str)) return minLength === 0;
    return str.trim().length >= minLength;
}

/**
 * Check if string has maximum length
 * @param {string} str - String to check
 * @param {number} maxLength - Maximum length
 * @returns {boolean} Whether string is within maximum length
 */
function hasMaxLength(str, maxLength) {
    if (isEmpty(str)) return true;
    return str.length <= maxLength;
}

/**
 * Sanitize string (trim and remove HTML tags)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/<[^>]*>/g, '');
}

// ================================
// NUMBER VALIDATION
// ================================

/**
 * Check if value is a positive number
 * @param {any} value - Value to check
 * @returns {boolean} Whether value is positive number
 */
function isPositiveNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num > 0;
}

/**
 * Check if value is a non-negative integer
 * @param {any} value - Value to check
 * @returns {boolean} Whether value is non-negative integer
 */
function isNonNegativeInteger(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && Number.isInteger(num);
}

/**
 * Check if value is within range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} Whether value is within range
 */
function isInRange(value, min, max) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
}

// ================================
// DATE VALIDATION
// ================================

/**
 * Check if value is a valid date
 * @param {any} value - Value to check
 * @returns {boolean} Whether value is valid date
 */
function isValidDate(value) {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
}

/**
 * Check if date is in the future
 * @param {any} value - Date value to check
 * @returns {boolean} Whether date is in the future
 */
function isFutureDate(value) {
    if (!isValidDate(value)) return false;
    return new Date(value) > new Date();
}

/**
 * Check if date is in the past
 * @param {any} value - Date value to check
 * @returns {boolean} Whether date is in the past
 */
function isPastDate(value) {
    if (!isValidDate(value)) return false;
    return new Date(value) < new Date();
}

// ================================
// URL VALIDATION
// ================================

const URL_REGEX = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

/**
 * Check if value is a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        new URL(url);
        return true;
    } catch {
        return URL_REGEX.test(url);
    }
}

// ================================
// PASSWORD VALIDATION
// ================================

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with details
 */
function validatePassword(password, options = {}) {
    const {
        minLength = 8,
        requireUppercase = true,
        requireLowercase = true,
        requireNumber = true,
        requireSpecial = false
    } = options;
    
    const errors = [];
    
    if (!password || password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters`);
    }
    
    if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (requireNumber && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// ================================
// ENUM VALIDATION
// ================================

/**
 * Check if value is in allowed enum values
 * @param {any} value - Value to check
 * @param {Array} allowedValues - Array of allowed values
 * @returns {boolean} Whether value is allowed
 */
function isValidEnum(value, allowedValues) {
    return allowedValues.includes(value);
}

// ================================
// EXPORT
// ================================

module.exports = {
    // Phone
    isValidPhone,
    isValidIndianPhone,
    normalizePhone,
    PHONE_REGEX,
    INDIAN_PHONE_REGEX,
    
    // Email
    isValidEmail,
    normalizeEmail,
    EMAIL_REGEX,
    
    // ID
    isValidObjectId,
    isValidUUID,
    OBJECT_ID_REGEX,
    UUID_REGEX,
    
    // String
    isEmpty,
    hasMinLength,
    hasMaxLength,
    sanitizeString,
    
    // Number
    isPositiveNumber,
    isNonNegativeInteger,
    isInRange,
    
    // Date
    isValidDate,
    isFutureDate,
    isPastDate,
    
    // URL
    isValidUrl,
    URL_REGEX,
    
    // Password
    validatePassword,
    
    // Enum
    isValidEnum
};
