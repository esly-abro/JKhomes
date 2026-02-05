/**
 * Workflow Conditions
 * Handles condition evaluation for workflow nodes
 */

/**
 * Evaluate a condition node
 */
async function evaluateCondition(lead, config) {
    try {
        const field = config?.field;
        const operator = config?.operator;
        const value = config?.value;

        console.log(`🔍 Evaluating condition: ${field} ${operator} ${value}`);

        if (!field) {
            return { passed: true, reason: 'No condition specified' };
        }

        // Get the field value from lead - handle special computed fields
        let fieldValue = getFieldValue(lead, field);

        console.log(`   Field "${field}" = "${fieldValue}"`);

        const passed = evaluateOperator(fieldValue, operator, value);

        console.log(`   Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);

        return {
            passed,
            field,
            operator,
            expectedValue: value,
            actualValue: fieldValue
        };
    } catch (error) {
        console.error('Condition evaluation error:', error);
        return { passed: false, error: error.message };
    }
}

/**
 * Get field value from lead, handling special computed fields
 */
function getFieldValue(lead, field) {
    switch (field) {
        case 'status':
            return lead.status;
        case 'callStatus':
            return lead.callStatus || lead.lastCallStatus || 'not_called';
        case 'whatsappStatus':
            return lead.whatsappStatus || lead.lastWhatsappStatus || 'not_sent';
        case 'budget':
            return lead.budget;
        case 'source':
            return lead.source;
        case 'propertyType':
            return lead.propertyType;
        case 'location':
            return lead.location || lead.preferredLocation;
        case 'callAttempts':
            return lead.callAttempts || 0;
        case 'lastContactDays':
            // Calculate days since last contact
            if (lead.lastContactAt) {
                const daysDiff = Math.floor((Date.now() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24));
                return daysDiff;
            }
            return 999; // No contact yet
        case 'responseTime':
            // Hours since lead was created without response
            if (lead.firstResponseAt) {
                const hoursDiff = Math.floor((new Date(lead.firstResponseAt).getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60));
                return hoursDiff;
            }
            return Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60));
        case 'hasAgent':
            return !!(lead.assignedAgent || lead.assignedTo);
        case 'hasSiteVisit':
            return !!(lead.siteVisitScheduled || lead.siteVisitDate);
        default:
            return getNestedValue(lead, field);
    }
}

/**
 * Evaluate operator against value
 */
function evaluateOperator(fieldValue, operator, value) {
    switch (operator) {
        case 'equals':
            return String(fieldValue).toLowerCase() === String(value).toLowerCase();
        case 'notEquals':
            return String(fieldValue).toLowerCase() !== String(value).toLowerCase();
        case 'contains':
            return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
        case 'greaterThan':
            return Number(fieldValue) > Number(value);
        case 'lessThan':
            return Number(fieldValue) < Number(value);
        case 'greaterThanOrEquals':
            return Number(fieldValue) >= Number(value);
        case 'lessThanOrEquals':
            return Number(fieldValue) <= Number(value);
        case 'isEmpty':
            return !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined;
        case 'isNotEmpty':
            return fieldValue && fieldValue !== '' && fieldValue !== null && fieldValue !== undefined;
        case 'isTrue':
            return fieldValue === true || fieldValue === 'true' || fieldValue === 1;
        case 'isFalse':
            return fieldValue === false || fieldValue === 'false' || fieldValue === 0 || !fieldValue;
        case 'startsWith':
            return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
        case 'endsWith':
            return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
        case 'matches':
            try {
                const regex = new RegExp(value, 'i');
                return regex.test(String(fieldValue));
            } catch {
                return false;
            }
        case 'in':
            const values = String(value).split(',').map(v => v.trim().toLowerCase());
            return values.includes(String(fieldValue).toLowerCase());
        case 'notIn':
            const notValues = String(value).split(',').map(v => v.trim().toLowerCase());
            return !notValues.includes(String(fieldValue).toLowerCase());
        default:
            return true;
    }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Interpolate template variables
 */
function interpolateTemplate(template, lead, context = {}) {
    let result = template
        .replace(/\{\{name\}\}/g, lead.name || '')
        .replace(/\{\{firstName\}\}/g, (lead.name || '').split(' ')[0])
        .replace(/\{\{lastName\}\}/g, (lead.name || '').split(' ').slice(1).join(' '))
        .replace(/\{\{email\}\}/g, lead.email || '')
        .replace(/\{\{phone\}\}/g, lead.phone || '')
        .replace(/\{\{budget\}\}/g, lead.budget ? `₹${lead.budget.toLocaleString()}` : '')
        .replace(/\{\{propertyType\}\}/g, lead.propertyType || '')
        .replace(/\{\{location\}\}/g, lead.location || '')
        .replace(/\{\{source\}\}/g, lead.source || '')
        .replace(/\{\{status\}\}/g, lead.status || '')
        .replace(/\{\{company\}\}/g, lead.company || '');
    
    // Context variables
    if (context) {
        result = result
            .replace(/\{\{context\.(\w+)\}\}/g, (match, key) => context[key] || '');
    }
    
    return result;
}

/**
 * Calculate delay in milliseconds
 */
function calculateDelay(config) {
    const duration = config?.duration || 1;
    const unit = config?.unit || 'minutes';
    
    const multipliers = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000
    };
    
    const delayMs = duration * (multipliers[unit] || multipliers.minutes);
    console.log(`⏱️ Calculated delay: ${duration} ${unit} = ${delayMs}ms`);
    return delayMs;
}

/**
 * Normalize phone number for matching
 */
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    
    let normalized = phone.replace(/[\s\-\(\)]/g, '');
    if (normalized.startsWith('+')) {
        normalized = normalized.substring(1);
    }
    if (!normalized.startsWith('91') && normalized.length === 10) {
        normalized = '91' + normalized;
    }
    return normalized;
}

module.exports = {
    evaluateCondition,
    getFieldValue,
    evaluateOperator,
    getNestedValue,
    interpolateTemplate,
    calculateDelay,
    normalizePhoneNumber
};
