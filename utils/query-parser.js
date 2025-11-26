/**
 * Advanced Search Query Parser
 * Parses structured queries like: level:error AND source:api AND message:"timeout"
 * Converts to safe SQL WHERE clauses with parameterization
 */

class QueryParser {
    constructor() {
        // Allowed field names (whitelist)
        this.allowedFields = ['level', 'source', 'message', 'category', 'timestamp', 'ip'];
        this.operators = ['AND', 'OR'];
    }

    /**
     * Parse query string into SQL WHERE clause and parameters
     * @param {string} query - Query string (e.g., "level:error AND source:api")
     * @returns {Object} {where: string, params: object}
     */
    parse(query) {
        if (!query || typeof query !== 'string') {
            return { where: '1=1', params: {} };
        }

        try {
            const tokens = this.tokenize(query);
            const conditions = this.buildConditions(tokens);
            
            if (!conditions.clauses.length) {
                return { where: '1=1', params: {} };
            }

            return {
                where: conditions.clauses.join(' '),
                params: conditions.params
            };
        } catch (error) {
            console.error('Query parse error:', error);
            // Fallback to simple LIKE search on message
            return {
                where: 'message LIKE :fallbackSearch',
                params: { fallbackSearch: `%${query}%` }
            };
        }
    }

    /**
     * Tokenize query string
     * @param {string} query
     * @returns {Array} tokens
     */
    tokenize(query) {
        const tokens = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = null;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const nextChar = query[i + 1];

            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = null;
                current += char;
            } else if (char === ' ' && !inQuotes) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current) tokens.push(current);

        return tokens;
    }

    /**
     * Build SQL conditions from tokens
     * @param {Array} tokens
     * @returns {Object} {clauses: [], params: {}}
     */
    buildConditions(tokens) {
        const clauses = [];
        const params = {};
        let paramCounter = 0;
        let currentOperator = 'AND';

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Check if token is an operator
            if (this.operators.includes(token.toUpperCase())) {
                currentOperator = token.toUpperCase();
                continue;
            }

            // Parse field:value syntax
            const colonIndex = token.indexOf(':');
            if (colonIndex > 0) {
                const field = token.substring(0, colonIndex).toLowerCase();
                let value = token.substring(colonIndex + 1);

                // Validate field name
                if (!this.allowedFields.includes(field)) {
                    continue; // Skip invalid fields
                }

                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length - 1);
                }

                // Generate parameter name
                const paramName = `param${paramCounter++}`;

                // Build condition based on field type
                let condition;
                if (field === 'level' || field === 'source' || field === 'category') {
                    // Exact match for enums
                    condition = `${field} = :${paramName}`;
                    params[paramName] = value;
                } else if (field === 'message') {
                    // LIKE match for text search
                    condition = `${field} LIKE :${paramName}`;
                    params[paramName] = `%${value}%`;
                } else if (field === 'timestamp') {
                    // Date/time handling (basic)
                    condition = `${field} >= :${paramName}`;
                    params[paramName] = value;
                } else {
                    // Default: exact match
                    condition = `${field} = :${paramName}`;
                    params[paramName] = value;
                }

                // Add operator if not first clause
                if (clauses.length > 0) {
                    clauses.push(currentOperator);
                }
                clauses.push(condition);
                
            } else {
                // No colon: treat as message search
                const paramName = `param${paramCounter++}`;
                if (clauses.length > 0) {
                    clauses.push(currentOperator);
                }
                clauses.push(`message LIKE :${paramName}`);
                params[paramName] = `%${token}%`;
            }
        }

        return { clauses, params };
    }

    /**
     * Simple validation to prevent obvious SQL injection attempts
     * @param {string} query
     * @returns {boolean}
     */
    isValid(query) {
        if (!query || typeof query !== 'string') return false;
        
        // Block common SQL injection patterns
        const dangerousPatterns = [
            /;\s*(drop|delete|update|insert|alter|create)/i,
            /--/,
            /\/\*/,
            /xp_/i,
            /exec\s*\(/i,
            /union\s+select/i
        ];

        return !dangerousPatterns.some(pattern => pattern.test(query));
    }
}

module.exports = new QueryParser();
