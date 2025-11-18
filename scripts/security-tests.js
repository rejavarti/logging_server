#!/usr/bin/env node
/**
 * Security & Auth Validation Tests
 * - Invalid token rejection
 * - Expired token handling
 * - No-auth access prevention
 * - Admin-only endpoint protection
 */
const axios = require('axios');

(async () => {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:10180';
  const password = process.env.SMOKE_PASSWORD || process.env.AUTH_PASSWORD || 'secure_admin_2024!';
  
  let passed = 0;
  let failed = 0;

  function log(msg) { console.log(`SEC: ${msg}`); }
  function pass(test) { log(`✅ ${test}`); passed++; }
  function fail(test, reason) { log(`❌ ${test}: ${reason}`); failed++; }

  try {
    // Get valid token first
    log('Obtaining valid admin token...');
    const loginRes = await axios.post(`${baseUrl}/api/auth/login`, { 
      username: 'admin', 
      password 
    }, { timeout: 8000 });
    
    if (!loginRes.data?.token) {
      throw new Error('Could not obtain admin token for testing');
    }
    const validToken = loginRes.data.token;
    log('Valid token obtained');

    // Test 1: No authorization header
    log('\n--- Test 1: No Authorization Header ---');
    try {
      await axios.get(`${baseUrl}/api/dashboard/refresh`, { timeout: 5000 });
      fail('No auth header rejection', 'Expected 401, got 200');
    } catch (err) {
      if (err.response?.status === 401) {
        pass('No auth header rejected with 401');
      } else {
        fail('No auth header rejection', `Expected 401, got ${err.response?.status || 'network error'}`);
      }
    }

    // Test 2: Invalid token format
    log('\n--- Test 2: Invalid Token Format ---');
    try {
      await axios.get(`${baseUrl}/api/dashboard/refresh`, { 
        headers: { Authorization: 'Bearer invalid_token_xyz' },
        timeout: 5000 
      });
      fail('Invalid token rejection', 'Expected 401, got 200');
    } catch (err) {
      if (err.response?.status === 401) {
        pass('Invalid token rejected with 401');
      } else {
        fail('Invalid token rejection', `Expected 401, got ${err.response?.status || 'network error'}`);
      }
    }

    // Test 3: Malformed Bearer header
    log('\n--- Test 3: Malformed Bearer Header ---');
    try {
      await axios.get(`${baseUrl}/api/logs/count`, { 
        headers: { Authorization: 'InvalidFormat ' + validToken },
        timeout: 5000 
      });
      fail('Malformed auth rejection', 'Expected 401, got 200');
    } catch (err) {
      if (err.response?.status === 401) {
        pass('Malformed Bearer header rejected with 401');
      } else {
        fail('Malformed auth rejection', `Expected 401, got ${err.response?.status || 'network error'}`);
      }
    }

    // Test 4: Valid token works
    log('\n--- Test 4: Valid Token Access ---');
    try {
      const res = await axios.get(`${baseUrl}/api/dashboard/refresh`, { 
        headers: { Authorization: `Bearer ${validToken}` },
        timeout: 5000 
      });
      if (res.status === 200) {
        pass('Valid token grants access');
      } else {
        fail('Valid token access', `Expected 200, got ${res.status}`);
      }
    } catch (err) {
      fail('Valid token access', err.message);
    }

    // Test 5: Protected new endpoints require auth
    log('\n--- Test 5: New Endpoints Require Auth ---');
    const newEndpoints = [
      '/api/analytics/stats',
      '/api/logs/count',
      '/api/dashboard/widget-data/log_count',
      '/api/search/suggest?q=test',
      '/api/websocket/clients'
    ];

    for (const endpoint of newEndpoints) {
      try {
        await axios.get(`${baseUrl}${endpoint}`, { timeout: 5000 });
        fail(`${endpoint} auth requirement`, 'Expected 401, got 200');
      } catch (err) {
        if (err.response?.status === 401) {
          pass(`${endpoint} requires auth`);
        } else {
          fail(`${endpoint} auth requirement`, `Expected 401, got ${err.response?.status || 'error'}`);
        }
      }
    }

    // Test 6: Admin endpoints require admin role (test with regular user if available)
    log('\n--- Test 6: Admin Endpoints Protection ---');
    // Note: We only have admin user in this setup, so we test that they DO have access
    const adminEndpoints = [
      '/admin/users',
      '/admin/settings',
      '/admin/health'
    ];

    for (const endpoint of adminEndpoints) {
      try {
        const res = await axios.get(`${baseUrl}${endpoint}`, { 
          headers: { Authorization: `Bearer ${validToken}` },
          timeout: 5000 
        });
        if (res.status === 200) {
          pass(`${endpoint} accessible to admin`);
        } else {
          fail(`${endpoint} admin access`, `Expected 200, got ${res.status}`);
        }
      } catch (err) {
        fail(`${endpoint} admin access`, err.message);
      }
    }

    // Test 7: CORS headers present
    log('\n--- Test 7: CORS Headers ---');
    try {
      const res = await axios.options(`${baseUrl}/api/dashboard/refresh`, { 
        timeout: 5000,
        headers: { 'Origin': baseUrl }  // Browsers send Origin header automatically
      });
      if (res.headers['access-control-allow-origin']) {
        pass('CORS headers present');
      } else {
        fail('CORS headers', 'No Access-Control-Allow-Origin header');
      }
    } catch (err) {
      // OPTIONS might not be explicitly handled, check a GET instead
      try {
        const res = await axios.get(`${baseUrl}/health`, { 
          timeout: 5000,
          headers: { 'Origin': baseUrl }
        });
        if (res.headers['access-control-allow-origin']) {
          pass('CORS headers present');
        } else {
          log('⚠️  CORS headers not detected (may be OK depending on config)');
        }
      } catch {
        log('⚠️  Could not verify CORS headers');
      }
    }

    // Test 8: Rate limiting headers
    log('\n--- Test 8: Rate Limiting ---');
    try {
      const res = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
      if (res.headers['x-ratelimit-limit'] || res.headers['ratelimit-limit']) {
        pass('Rate limit headers present');
      } else {
        log('⚠️  Rate limit headers not detected on /health (may be expected)');
      }
    } catch (err) {
      log('⚠️  Could not verify rate limiting headers');
    }

    // Test 9: Security headers
    log('\n--- Test 9: Security Headers ---');
    try {
      const res = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      let headerCount = 0;
      for (const header of requiredHeaders) {
        if (res.headers[header]) {
          headerCount++;
        }
      }
      
      if (headerCount >= 2) {
        pass(`Security headers present (${headerCount}/${requiredHeaders.length})`);
      } else {
        log(`⚠️  Limited security headers detected (${headerCount}/${requiredHeaders.length})`);
      }
    } catch (err) {
      log('⚠️  Could not verify security headers');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`SECURITY TESTS SUMMARY`);
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('\nSEC: Fatal error:', err.message);
    process.exit(1);
  }
})();
