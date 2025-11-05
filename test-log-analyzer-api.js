/**
 * API TESTING SCRIPT FOR LOG ANALYZER
 * Comprehensive testing of all log analyzer endpoints
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:10180';
const API_BASE = `${BASE_URL}/api/log-analyzer`;

console.log('🧪 Testing Log Analyzer API Integration...\n');

// Test configuration
const testConfig = {
    username: 'admin',
    password: 'ChangeMe123!'
};

let authToken = null;

// Helper function for authenticated requests
async function authenticatedRequest(url, options = {}) {
    if (!authToken) {
        throw new Error('Not authenticated');
    }
    
    return fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${authToken}`,
            ...options.headers
        }
    });
}

// Login and get JWT token
async function authenticate() {
    try {
        console.log('🔐 Authenticating...');
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testConfig)
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        const data = await response.json();
        authToken = data.token;
        console.log('✅ Authentication successful');
        return true;
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        return false;
    }
}

// Test 1: Check if log analyzer routes are accessible
async function testApiAccess() {
    try {
        console.log('🔄 Testing API access...');
        
        // Test formats endpoint
        const formatsResponse = await authenticatedRequest(`${API_BASE}/formats`);
        if (!formatsResponse.ok) {
            throw new Error(`Formats endpoint failed: ${formatsResponse.status}`);
        }
        
        const formatsData = await formatsResponse.json();
        console.log(`✅ Formats endpoint accessible (${formatsData.totalFormats} formats supported)`);
        
        // Test files endpoint
        const filesResponse = await authenticatedRequest(`${API_BASE}/files`);
        if (!filesResponse.ok) {
            throw new Error(`Files endpoint failed: ${filesResponse.status}`);
        }
        
        const filesData = await filesResponse.json();
        console.log(`✅ Files endpoint accessible (${filesData.pagination?.totalFiles || 0} files)`);
        
        // Test dashboard stats endpoint
        const statsResponse = await authenticatedRequest(`${API_BASE}/dashboard/stats`);
        if (!statsResponse.ok) {
            throw new Error(`Dashboard stats failed: ${statsResponse.status}`);
        }
        
        const statsData = await statsResponse.json();
        console.log(`✅ Dashboard stats accessible`);
        console.log(`  - Total files: ${statsData.stats?.totalFiles || 0}`);
        console.log(`  - Total analyses: ${statsData.stats?.totalAnalyses || 0}`);
        
        return true;
    } catch (error) {
        console.error('❌ API access test failed:', error.message);
        return false;
    }
}

// Test 2: File upload functionality
async function testFileUpload() {
    try {
        console.log('\n🔄 Testing file upload...');
        
        // Create test log file if it doesn't exist
        const testFilePath = path.join(__dirname, 'sample-logs', 'apache-access.log');
        if (!fs.existsSync(testFilePath)) {
            throw new Error(`Test file not found: ${testFilePath}`);
        }
        
        // Prepare form data
        const form = new FormData();
        form.append('logFiles', fs.createReadStream(testFilePath));
        
        // Upload file
        const uploadResponse = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                ...form.getHeaders()
            },
            body: form
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }
        
        const uploadData = await uploadResponse.json();
        console.log('✅ File upload successful');
        console.log(`  - Files processed: ${uploadData.totalFiles}`);
        console.log(`  - Successful uploads: ${uploadData.successfulUploads}`);
        
        if (uploadData.results && uploadData.results.length > 0) {
            const result = uploadData.results[0];
            console.log(`  - Detected format: ${result.detectedFormat?.name || 'None'}`);
            console.log(`  - Confidence: ${Math.round((result.detectedFormat?.score || 0) * 100)}%`);
            return result.fileId;
        }
        
        return null;
    } catch (error) {
        console.error('❌ File upload test failed:', error.message);
        return null;
    }
}

// Test 3: File parsing
async function testFileParsing(fileId) {
    if (!fileId) {
        console.log('⚠️ Skipping parsing test (no file ID)');
        return null;
    }
    
    try {
        console.log('\n🔄 Testing file parsing...');
        
        const parseResponse = await authenticatedRequest(`${API_BASE}/parse/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        if (!parseResponse.ok) {
            const errorText = await parseResponse.text();
            throw new Error(`Parse failed: ${parseResponse.status} - ${errorText}`);
        }
        
        const parseData = await parseResponse.json();
        console.log('✅ File parsing successful');
        console.log(`  - Format used: ${parseData.formatUsed}`);
        console.log(`  - Total lines: ${parseData.stats?.totalLines || 0}`);
        console.log(`  - Parsed lines: ${parseData.stats?.parsedLines || 0}`);
        console.log(`  - Success rate: ${Math.round((parseData.stats?.parsedLines / parseData.stats?.totalLines) * 100)}%`);
        
        return parseData.analysisId;
    } catch (error) {
        console.error('❌ File parsing test failed:', error.message);
        return null;
    }
}

// Test 4: Analysis retrieval
async function testAnalysisRetrieval(analysisId) {
    if (!analysisId) {
        console.log('⚠️ Skipping analysis test (no analysis ID)');
        return false;
    }
    
    try {
        console.log('\n🔄 Testing analysis retrieval...');
        
        const analysisResponse = await authenticatedRequest(`${API_BASE}/analysis/${analysisId}`);
        
        if (!analysisResponse.ok) {
            throw new Error(`Analysis retrieval failed: ${analysisResponse.status}`);
        }
        
        const analysisData = await analysisResponse.json();
        console.log('✅ Analysis retrieval successful');
        console.log(`  - Analysis ID: ${analysisData.analysis?.id}`);
        console.log(`  - Patterns detected: ${analysisData.patterns?.length || 0}`);
        console.log(`  - Sample entries: ${analysisData.sampleEntries?.length || 0}`);
        
        if (analysisData.analysis?.analysis_data) {
            const data = analysisData.analysis.analysis_data;
            console.log(`  - Log levels: ${Object.keys(data.logLevels || {}).length}`);
            console.log(`  - Unique IPs: ${data.network?.uniqueIPs || 0}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Analysis retrieval test failed:', error.message);
        return false;
    }
}

// Test 5: Search functionality
async function testSearchFunctionality(analysisId) {
    if (!analysisId) {
        console.log('⚠️ Skipping search test (no analysis ID)');
        return false;
    }
    
    try {
        console.log('\n🔄 Testing search functionality...');
        
        const searchResponse = await authenticatedRequest(`${API_BASE}/search/${analysisId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'GET',
                limit: 10
            })
        });
        
        if (!searchResponse.ok) {
            throw new Error(`Search failed: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        console.log('✅ Search functionality working');
        console.log(`  - Results found: ${searchData.entries?.length || 0}`);
        console.log(`  - Total matches: ${searchData.total || 0}`);
        
        return true;
    } catch (error) {
        console.error('❌ Search test failed:', error.message);
        return false;
    }
}

// Test 6: Web interface access
async function testWebInterface() {
    try {
        console.log('\n🔄 Testing web interface...');
        
        const interfaceResponse = await fetch(`${BASE_URL}/log-analyzer`);
        
        if (!interfaceResponse.ok) {
            throw new Error(`Web interface failed: ${interfaceResponse.status}`);
        }
        
        const htmlContent = await interfaceResponse.text();
        if (htmlContent.includes('Log File Analyzer') && htmlContent.includes('Upload Log Files')) {
            console.log('✅ Web interface accessible');
            console.log('  - HTML content loaded');
            console.log('  - Upload interface present');
            return true;
        } else {
            throw new Error('Expected content not found in web interface');
        }
    } catch (error) {
        console.error('❌ Web interface test failed:', error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting comprehensive Log Analyzer API testing...\n');
    
    let testResults = {
        authentication: false,
        apiAccess: false,
        fileUpload: false,
        fileParsing: false,
        analysisRetrieval: false,
        search: false,
        webInterface: false
    };
    
    // Test 1: Authentication
    testResults.authentication = await authenticate();
    if (!testResults.authentication) {
        console.log('\n❌ Cannot proceed without authentication');
        return testResults;
    }
    
    // Test 2: API Access
    testResults.apiAccess = await testApiAccess();
    
    // Test 3: File Upload
    const fileId = await testFileUpload();
    testResults.fileUpload = !!fileId;
    
    // Test 4: File Parsing
    const analysisId = await testFileParsing(fileId);
    testResults.fileParsing = !!analysisId;
    
    // Test 5: Analysis Retrieval
    testResults.analysisRetrieval = await testAnalysisRetrieval(analysisId);
    
    // Test 6: Search
    testResults.search = await testSearchFunctionality(analysisId);
    
    // Test 7: Web Interface
    testResults.webInterface = await testWebInterface();
    
    // Summary
    console.log('\n📊 TEST RESULTS SUMMARY:');
    console.log('═══════════════════════════════════════');
    Object.entries(testResults).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test.charAt(0).toUpperCase() + test.slice(1)}: ${passed ? 'PASSED' : 'FAILED'}`);
    });
    
    const passedTests = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log(`\n🎯 Overall Score: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 ALL TESTS PASSED - Log Analyzer is fully functional!');
    } else if (passedTests >= totalTests * 0.7) {
        console.log('⚠️ Most tests passed - Minor issues to resolve');
    } else {
        console.log('❌ Multiple failures - Significant issues need attention');
    }
    
    return testResults;
}

// Handle missing node-fetch gracefully
if (typeof fetch === 'undefined') {
    console.log('⚠️ node-fetch not available. Installing...');
    console.log('Run: npm install node-fetch@2 form-data');
    console.log('Then run this script again.');
    process.exit(1);
}

// Run the tests
runAllTests().catch(error => {
    console.error('💥 Test suite crashed:', error.message);
    process.exit(1);
});