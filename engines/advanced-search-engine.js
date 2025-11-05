// engines/advanced-search-engine.js - Elasticsearch-style Query Engine with DSL Support
const Fuse = require('fuse.js');

/**
 * Advanced Search & Query Language Engine
 * Provides Elasticsearch-style DSL query support with fuzzy search, aggregations, and caching
 */
class AdvancedSearchEngine {
    constructor(database, loggers, config) {
        this.dal = database; // Use DAL instead of direct db access
        this.loggers = loggers;
        this.config = config || {};
        this.fuseOptions = {
            keys: ['message', 'source', 'device_id', 'category'],
            threshold: 0.4,
            includeScore: true,
            includeMatches: true
        };
        this.queryCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.isRunning = false;
    }

    async initialize() {
        try {
            this.loggers.system.info('🔍 Initializing Advanced Search Engine...');
            
            // Test Fuse.js availability
            if (!Fuse) {
                this.loggers.system.warn('⚠️ Fuse.js not available, fuzzy search disabled');
                this.fuseOptions = null;
            }
            
            // Initialize query cache cleanup interval
            this.cacheCleanupInterval = setInterval(() => {
                this.cleanupCache();
            }, this.cacheTimeout);
            
            this.isRunning = true;
            this.loggers.system.info('✅ Advanced Search Engine initialized successfully');
        } catch (error) {
            this.loggers.system.error('❌ Failed to initialize Advanced Search Engine:', error);
            // Initialize with basic functionality
            this.isRunning = true;
            this.loggers.system.warn('⚠️ Advanced Search Engine initialized with reduced functionality');
        }
    }

    // Parse Elasticsearch-style DSL query
    parseQuery(queryDSL) {
        if (typeof queryDSL === 'string') {
            return this.parseSimpleQuery(queryDSL);
        }

        const parsed = {
            filters: [],
            textSearch: null,
            fuzzy: false,
            aggregations: {},
            sort: [],
            size: 100,
            from: 0
        };

        // Parse query structure
        if (queryDSL.query) {
            this.parseQueryClause(queryDSL.query, parsed);
        }

        // Parse aggregations
        if (queryDSL.aggs || queryDSL.aggregations) {
            parsed.aggregations = queryDSL.aggs || queryDSL.aggregations;
        }

        // Parse sort
        if (queryDSL.sort) {
            parsed.sort = Array.isArray(queryDSL.sort) ? queryDSL.sort : [queryDSL.sort];
        }

        // Parse pagination
        if (queryDSL.size !== undefined) parsed.size = queryDSL.size;
        if (queryDSL.from !== undefined) parsed.from = queryDSL.from;

        return parsed;
    }

    parseQueryClause(query, parsed) {
        if (query.bool) {
            this.parseBoolQuery(query.bool, parsed);
        } else if (query.match) {
            this.parseMatchQuery(query.match, parsed);
        } else if (query.term) {
            this.parseTermQuery(query.term, parsed);
        } else if (query.range) {
            this.parseRangeQuery(query.range, parsed);
        } else if (query.wildcard) {
            this.parseWildcardQuery(query.wildcard, parsed);
        } else if (query.fuzzy) {
            this.parseFuzzyQuery(query.fuzzy, parsed);
        } else if (query.query_string) {
            this.parseQueryStringQuery(query.query_string, parsed);
        }
    }

    parseBoolQuery(boolQuery, parsed) {
        const clauses = ['must', 'should', 'must_not', 'filter'];
        
        clauses.forEach(clause => {
            if (boolQuery[clause]) {
                const queries = Array.isArray(boolQuery[clause]) ? boolQuery[clause] : [boolQuery[clause]];
                queries.forEach(subQuery => {
                    this.parseQueryClause(subQuery, parsed);
                });
            }
        });
    }

    parseMatchQuery(matchQuery, parsed) {
        Object.entries(matchQuery).forEach(([field, value]) => {
            if (typeof value === 'object') {
                parsed.textSearch = {
                    field: field,
                    query: value.query,
                    operator: value.operator || 'or',
                    fuzziness: value.fuzziness || 0
                };
                if (value.fuzziness) parsed.fuzzy = true;
            } else {
                parsed.textSearch = { field: field, query: value };
            }
        });
    }

    parseTermQuery(termQuery, parsed) {
        Object.entries(termQuery).forEach(([field, value]) => {
            parsed.filters.push({
                type: 'term',
                field: field,
                value: value
            });
        });
    }

    parseRangeQuery(rangeQuery, parsed) {
        Object.entries(rangeQuery).forEach(([field, ranges]) => {
            parsed.filters.push({
                type: 'range',
                field: field,
                ...ranges
            });
        });
    }

    parseWildcardQuery(wildcardQuery, parsed) {
        Object.entries(wildcardQuery).forEach(([field, pattern]) => {
            parsed.filters.push({
                type: 'wildcard',
                field: field,
                pattern: pattern
            });
        });
    }

    parseFuzzyQuery(fuzzyQuery, parsed) {
        Object.entries(fuzzyQuery).forEach(([field, config]) => {
            parsed.textSearch = {
                field: field,
                query: typeof config === 'string' ? config : config.value,
                fuzziness: typeof config === 'object' ? config.fuzziness : 2
            };
            parsed.fuzzy = true;
        });
    }

    parseQueryStringQuery(queryStringQuery, parsed) {
        const { query, default_field, fields } = queryStringQuery;
        parsed.textSearch = {
            field: default_field || (fields && fields[0]) || 'message',
            query: query,
            queryString: true
        };
    }

    parseSimpleQuery(queryString) {
        const parsed = {
            filters: [],
            textSearch: null,
            fuzzy: false,
            aggregations: {},
            sort: [{ timestamp: 'desc' }],
            size: 100,
            from: 0
        };

        // Parse simple query string like "severity:error AND message:failed"
        const tokens = this.tokenizeQuery(queryString);
        
        for (const token of tokens) {
            if (token.includes(':')) {
                const [field, value] = token.split(':', 2);
                
                if (field === '_all' || field === 'q') {
                    parsed.textSearch = { field: 'message', query: value };
                } else if (this.isDateField(field)) {
                    parsed.filters.push({
                        type: 'range',
                        field: field,
                        gte: this.parseDate(value)
                    });
                } else {
                    parsed.filters.push({
                        type: 'term',
                        field: field,
                        value: value.replace(/['"]/g, '')
                    });
                }
            } else if (!['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
                // Full-text search
                parsed.textSearch = { field: 'message', query: token };
            }
        }

        return parsed;
    }

    tokenizeQuery(query) {
        // Simple tokenizer - can be enhanced for complex queries
        return query.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    }

    isDateField(field) {
        return ['timestamp', 'created_at', 'updated_at', 'date'].includes(field);
    }

    parseDate(dateStr) {
        // Parse various date formats
        const date = new Date(dateStr);
        return date.toISOString();
    }

    async executeSearch(queryDSL, options = {}) {
        try {
            const cacheKey = JSON.stringify(queryDSL);
            const cached = this.queryCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.result;
            }

            const parsed = this.parseQuery(queryDSL);
            const sqlResult = await this.buildSQLQuery(parsed);
            
            let results = await this.executeSQLQuery(sqlResult.sql, sqlResult.params);
            
            // Apply fuzzy search if needed
            if (parsed.fuzzy && parsed.textSearch && results.length > 0) {
                results = this.applyFuzzySearch(results, parsed.textSearch);
            }

            // Execute aggregations if specified
            let aggregations = {};
            if (Object.keys(parsed.aggregations).length > 0) {
                aggregations = await this.executeAggregations(parsed.aggregations, parsed);
            }

            const result = {
                hits: {
                    total: results.length,
                    hits: results.slice(parsed.from, parsed.from + parsed.size)
                },
                aggregations: aggregations,
                took: Date.now() - (cached?.timestamp || Date.now())
            };

            // Cache result
            this.queryCache.set(cacheKey, {
                result: result,
                timestamp: Date.now()
            });

            // Cleanup old cache entries
            this.cleanupCache();

            return result;
        } catch (error) {
            this.loggers.system.error('Advanced search execution error:', error);
            throw error;
        }
    }

    buildSQLQuery(parsed) {
        let sql = 'SELECT * FROM log_events WHERE 1=1';
        const params = [];

        // Add filters
        for (const filter of parsed.filters) {
            const condition = this.buildFilterCondition(filter, params);
            if (condition) {
                sql += ` AND ${condition}`;
            }
        }

        // Add text search
        if (parsed.textSearch && !parsed.fuzzy) {
            const textCondition = this.buildTextSearchCondition(parsed.textSearch, params);
            if (textCondition) {
                sql += ` AND ${textCondition}`;
            }
        }

        // Add sorting
        if (parsed.sort.length > 0) {
            sql += ' ORDER BY ' + parsed.sort.map(sort => {
                if (typeof sort === 'string') {
                    return `${sort} DESC`;
                } else {
                    const field = Object.keys(sort)[0];
                    const direction = sort[field].toUpperCase();
                    return `${field} ${direction}`;
                }
            }).join(', ');
        }

        // Add limit
        sql += ` LIMIT ${parsed.size + parsed.from}`;

        return { sql, params };
    }

    buildFilterCondition(filter, params) {
        switch (filter.type) {
            case 'term':
                params.push(filter.value);
                return `${filter.field} = ?`;
            
            case 'range':
                const conditions = [];
                if (filter.gte !== undefined) {
                    params.push(filter.gte);
                    conditions.push(`${filter.field} >= ?`);
                }
                if (filter.lte !== undefined) {
                    params.push(filter.lte);
                    conditions.push(`${filter.field} <= ?`);
                }
                if (filter.gt !== undefined) {
                    params.push(filter.gt);
                    conditions.push(`${filter.field} > ?`);
                }
                if (filter.lt !== undefined) {
                    params.push(filter.lt);
                    conditions.push(`${filter.field} < ?`);
                }
                return conditions.join(' AND ');
            
            case 'wildcard':
                params.push(filter.pattern.replace(/\*/g, '%').replace(/\?/g, '_'));
                return `${filter.field} LIKE ?`;
            
            default:
                return null;
        }
    }

    buildTextSearchCondition(textSearch, params) {
        if (textSearch.queryString) {
            // Handle query string syntax
            return this.buildQueryStringCondition(textSearch.query, params);
        }

        params.push(`%${textSearch.query}%`);
        return `${textSearch.field} LIKE ?`;
    }

    buildQueryStringCondition(queryString, params) {
        // Simple query string parser for basic operators
        const terms = queryString.split(/\s+/);
        const conditions = [];

        for (const term of terms) {
            if (term.includes(':')) {
                const [field, value] = term.split(':', 2);
                params.push(`%${value}%`);
                conditions.push(`${field} LIKE ?`);
            } else if (term !== 'AND' && term !== 'OR') {
                params.push(`%${term}%`);
                conditions.push(`message LIKE ?`);
            }
        }

        return conditions.join(' AND ');
    }

    async executeSQLQuery(sql, params) {
        try {
            // Use DAL query method if available
            if (typeof this.dal.query === 'function') {
                const rows = await this.dal.query(sql, params);
                
                const results = rows.map(row => ({
                    _id: row.id,
                    _source: {
                        timestamp: row.timestamp,
                        message: row.message,
                        severity: row.severity,
                        source: row.source,
                        device_id: row.device_id,
                        category: row.category,
                        metadata: row.metadata ? JSON.parse(row.metadata || '{}') : {}
                    }
                }));

                return results;
            } else {
                // Fallback to direct database access if DAL not available
                return new Promise((resolve, reject) => {
                    this.dal.all(sql, params, (err, rows) => {
                        if (err) return reject(err);

                        const results = rows.map(row => ({
                            _id: row.id,
                            _source: {
                                timestamp: row.timestamp,
                                message: row.message,
                                severity: row.severity,
                                source: row.source,
                                device_id: row.device_id,
                                category: row.category,
                                metadata: row.metadata ? JSON.parse(row.metadata || '{}') : {}
                            }
                        }));

                        resolve(results);
                    });
                });
            }
        } catch (error) {
            this.loggers.system.error('SQL query execution error:', error);
            return []; // Return empty results on error
        }
    }

    applyFuzzySearch(results, textSearch) {
        const fuse = new Fuse(results.map(r => r._source), {
            ...this.fuseOptions,
            threshold: 0.6 - (textSearch.fuzziness || 0) * 0.1
        });

        const fuzzyResults = fuse.search(textSearch.query);
        
        return fuzzyResults.map(result => ({
            _id: results.find(r => r._source === result.item)._id,
            _source: result.item,
            _score: 1 - result.score,
            _matches: result.matches
        }));
    }

    async executeAggregations(aggregations, parsed) {
        const results = {};

        for (const [aggName, aggConfig] of Object.entries(aggregations)) {
            if (aggConfig.terms) {
                results[aggName] = await this.executeTermsAggregation(aggConfig.terms, parsed);
            } else if (aggConfig.date_histogram) {
                results[aggName] = await this.executeDateHistogramAggregation(aggConfig.date_histogram, parsed);
            } else if (aggConfig.avg) {
                results[aggName] = await this.executeMetricAggregation('AVG', aggConfig.avg.field, parsed);
            } else if (aggConfig.sum) {
                results[aggName] = await this.executeMetricAggregation('SUM', aggConfig.sum.field, parsed);
            } else if (aggConfig.count) {
                results[aggName] = await this.executeMetricAggregation('COUNT', '*', parsed);
            }
        }

        return results;
    }

    async executeTermsAggregation(termsConfig, parsed) {
        try {
            const field = termsConfig.field;
            const size = termsConfig.size || 10;

            let sql = `SELECT ${field}, COUNT(*) as doc_count FROM log_events WHERE 1=1`;
            const params = [];

            // Apply same filters as main query
            for (const filter of parsed.filters) {
                const condition = this.buildFilterCondition(filter, params);
                if (condition) {
                    sql += ` AND ${condition}`;
                }
            }

            sql += ` GROUP BY ${field} ORDER BY doc_count DESC LIMIT ${size}`;

            if (typeof this.dal.query === 'function') {
                const rows = await this.dal.query(sql, params);
                return {
                    buckets: rows.map(row => ({
                        key: row[field],
                        doc_count: row.doc_count
                    }))
                };
            } else {
                return new Promise((resolve, reject) => {
                    this.dal.all(sql, params, (err, rows) => {
                        if (err) return reject(err);

                        resolve({
                            buckets: rows.map(row => ({
                                key: row[field],
                                doc_count: row.doc_count
                            }))
                        });
                    });
                });
            }
        } catch (error) {
            this.loggers.system.error('Terms aggregation error:', error);
            return { buckets: [] };
        }
    }

    async executeDateHistogramAggregation(histogramConfig, parsed) {
        try {
            const field = histogramConfig.field || 'timestamp';
            const interval = histogramConfig.interval || '1h';

            // Convert interval to SQLite date functions
            let dateFunction;
            switch (interval) {
                case '1m': dateFunction = "strftime('%Y-%m-%d %H:%M', timestamp)"; break;
                case '1h': dateFunction = "strftime('%Y-%m-%d %H', timestamp)"; break;
                case '1d': dateFunction = "strftime('%Y-%m-%d', timestamp)"; break;
                default: dateFunction = "strftime('%Y-%m-%d %H', timestamp)";
            }

            let sql = `SELECT ${dateFunction} as key, COUNT(*) as doc_count FROM log_events WHERE 1=1`;
            const params = [];

            // Apply same filters as main query
            for (const filter of parsed.filters) {
                const condition = this.buildFilterCondition(filter, params);
                if (condition) {
                    sql += ` AND ${condition}`;
                }
            }

            sql += ` GROUP BY ${dateFunction} ORDER BY key`;

            if (typeof this.dal.query === 'function') {
                const rows = await this.dal.query(sql, params);
                return {
                    buckets: rows.map(row => ({
                        key: row.key,
                        key_as_string: row.key,
                        doc_count: row.doc_count
                    }))
                };
            } else {
                return new Promise((resolve, reject) => {
                    this.dal.all(sql, params, (err, rows) => {
                        if (err) return reject(err);

                        resolve({
                            buckets: rows.map(row => ({
                                key: row.key,
                                key_as_string: row.key,
                                doc_count: row.doc_count
                            }))
                        });
                    });
                });
            }
        } catch (error) {
            this.loggers.system.error('Date histogram aggregation error:', error);
            return { buckets: [] };
        }
    }

    async executeMetricAggregation(metric, field, parsed) {
        try {
            let sql = `SELECT ${metric}(${field}) as value FROM log_events WHERE 1=1`;
            const params = [];

            // Apply same filters as main query
            for (const filter of parsed.filters) {
                const condition = this.buildFilterCondition(filter, params);
                if (condition) {
                    sql += ` AND ${condition}`;
                }
            }

            if (typeof this.dal.get === 'function') {
                const row = await this.dal.get(sql, params);
                return { value: row?.value || 0 };
            } else {
                return new Promise((resolve, reject) => {
                    this.dal.get(sql, params, (err, row) => {
                        if (err) return reject(err);
                        resolve({ value: row?.value || 0 });
                    });
                });
            }
        } catch (error) {
            this.loggers.system.error('Metric aggregation error:', error);
            return { value: 0 };
        }
    }

    cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of this.queryCache.entries()) {
            if (now - entry.timestamp > this.cacheTimeout) {
                this.queryCache.delete(key);
            }
        }
    }

    // Predefined query templates
    getQueryTemplates() {
        return {
            'errors_last_hour': {
                query: {
                    bool: {
                        must: [
                            { term: { severity: 'error' } },
                            { range: { timestamp: { gte: 'now-1h' } } }
                        ]
                    }
                },
                aggs: {
                    by_source: { terms: { field: 'source', size: 10 } }
                }
            },
            'security_events': {
                query: {
                    bool: {
                        should: [
                            { match: { message: 'authentication' } },
                            { match: { message: 'login' } },
                            { match: { category: 'security' } }
                        ]
                    }
                },
                sort: [{ timestamp: 'desc' }]
            },
            'device_activity': {
                query: { match_all: {} },
                aggs: {
                    by_device: { terms: { field: 'device_id', size: 20 } },
                    activity_over_time: {
                        date_histogram: {
                            field: 'timestamp',
                            interval: '1h'
                        }
                    }
                }
            }
        };
    }
}

module.exports = AdvancedSearchEngine;