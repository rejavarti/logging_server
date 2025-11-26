param(
    [string]$ServerUrl = "http://localhost:10180",
    [string]$Username = "admin",
    [string]$Password = "ChangeMe123!"
)

$lockTestScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({type: msg.type(), text: msg.text()}));
  
  try {
    await page.goto('$ServerUrl/login', {waitUntil:'networkidle2', timeout:10000});
    await page.type('#username', '$Username');
    await page.type('#password', '$Password');
    await page.click('button[type=submit]');
    await page.waitForNavigation({waitUntil:'networkidle2'});
    await page.goto('$ServerUrl/dashboard');
    await page.waitForSelector('#lockText', {timeout:5000});
    
    // Wait for grid initialization
    await new Promise(r=>setTimeout(r, 2000));
    
    const before = await page.evaluate(()=>({
        lockText: document.getElementById('lockText').textContent,
        gridExists: !!window.grid,
        gridHasSetOptions: window.grid && typeof window.grid.setOptions === 'function',
        isLockedVar: typeof isLocked !== 'undefined' ? isLocked : 'undefined',
        buttonExists: !!document.querySelector('button[onclick*="toggleLock"]'),
        allControlBtns: document.querySelectorAll('.control-btn').length
    }));
    
    console.log('BEFORE STATE:', JSON.stringify(before, null, 2));
    
    // Click lock button
    await page.click('button[onclick*="toggleLock"]');
    
    // Wait and check state changes
    for(let i=0; i<10; i++){
        await new Promise(r=>setTimeout(r, 200));
        const current = await page.evaluate((iteration)=>({
            lockText: document.getElementById('lockText').textContent,
            isLockedVar: typeof isLocked !== 'undefined' ? isLocked : 'undefined',
            lockError: window._lockError || null,
            iteration: iteration
        }), i);
        console.log('ITERATION', i, ':', JSON.stringify(current));
        if(current.lockText !== before.lockText) break;
    }
    
    const after = await page.evaluate(()=>({
        lockText: document.getElementById('lockText').textContent,
        isLockedVar: typeof isLocked !== 'undefined' ? isLocked : 'undefined',
        lockError: window._lockError || null
    }));
    
    console.log('AFTER STATE:', JSON.stringify(after, null, 2));
    console.log('CONSOLE MESSAGES:', JSON.stringify(consoleMessages, null, 2));
    
    const success = before.lockText==='Unlocked' && after.lockText==='Locked' && !after.lockError;
    console.log(JSON.stringify({success, before, after, consoleMessages}));
  } catch(e){
    console.log(JSON.stringify({success:false,error:e.message,stack:e.stack}));
  }
  await browser.close();
})();
"@

Write-Host "Running lock toggle debug test..." -ForegroundColor Cyan
node -e $lockTestScript
