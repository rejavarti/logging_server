param(
    [string]$ServerUrl = "http://localhost:10180",
    [string]$Username = "admin"
)

$Password = Read-Host "Enter password" -AsSecureString
$adminSecretValue = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password))

$sidebarScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  try {
    console.log('Navigating to login...');
    await page.goto('$ServerUrl/login', {waitUntil:'networkidle2', timeout:10000});
    await page.type('#username', '$Username');
    await page.type('#password', '$adminSecretValue');
    await page.click('button[type=submit]');
    await page.waitForNavigation({waitUntil:'networkidle2', timeout:10000});
    
    console.log('Navigating to dashboard...');
    await page.goto('$ServerUrl/dashboard', {waitUntil:'networkidle2', timeout:10000});
    await new Promise(r=>setTimeout(r, 1000));
    
    // Check if sidebar toggle button exists
    const buttonExists = await page.evaluate(()=>!!document.querySelector('.sidebar-toggle'));
    console.log('Sidebar toggle button exists:', buttonExists);
    
    const buttonInfo = await page.evaluate(()=>{
      const btn = document.querySelector('.sidebar-toggle');
      if (!btn) return null;
      const style = window.getComputedStyle(btn);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        offsetWidth: btn.offsetWidth,
        offsetHeight: btn.offsetHeight,
        offsetParent: !!btn.offsetParent
      };
    });
    console.log('Button computed styles:', JSON.stringify(buttonInfo, null, 2));
    
    if (!buttonExists) {
      console.log('Button not found! Checking all buttons:');
      const allButtons = await page.evaluate(()=>Array.from(document.querySelectorAll('button')).map(b=>({
        class: b.className,
        onclick: b.getAttribute('onclick'),
        visible: b.offsetParent !== null
      })));
      console.log('All buttons:', JSON.stringify(allButtons, null, 2));
    }
    
    // Skip the waitForSelector - we know it exists, just click it
    console.log('Skipping waitForSelector, directly clicking...');
    
    // Check initial state
    const state1 = await page.evaluate(()=>document.body.classList.contains('sidebar-collapsed'));
    console.log('Initial state (sidebar-collapsed on body):', state1);
    
    // Click 1
    console.log('Clicking sidebar toggle...');
    await page.evaluate(()=>document.querySelector('.sidebar-toggle').click());
    await new Promise(r=>setTimeout(r, 500));
    const state2 = await page.evaluate(()=>document.body.classList.contains('sidebar-collapsed'));
    console.log('After click 1:', state2);
    
    // Click 2
    await page.evaluate(()=>document.querySelector('.sidebar-toggle').click());
    await new Promise(r=>setTimeout(r, 500));
    const state3 = await page.evaluate(()=>document.body.classList.contains('sidebar-collapsed'));
    console.log('After click 2:', state3);
    
    const success = state1 !== state2 && state2 !== state3;
    console.log(JSON.stringify({success, states:[state1, state2, state3]}));
  } catch(e){
    console.log(JSON.stringify({success:false, error: e.message}));
  }
  await browser.close();
})();
"@

Write-Host "`nTesting Sidebar Toggle..." -ForegroundColor Cyan
node -e $sidebarScript
