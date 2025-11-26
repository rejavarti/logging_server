param(
    [string]$ServerUrl = "http://localhost:10180",
    [string]$Username = "admin",
    [string]$Password = "ChangeMe123!"
)

Write-Host "`n=== THEME TOGGLE DEBUG ===" -ForegroundColor Cyan
$themeScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({type: msg.type(), text: msg.text()}));
  
  try {
    await page.goto('$ServerUrl/login', {waitUntil:'networkidle2', timeout:10000});
    await page.type('#username', '$Username');
    await page.type('#password', '$Password');
    await page.click('button[type=submit]');
    await page.waitForNavigation({waitUntil:'networkidle2'});
    await page.goto('$ServerUrl/dashboard', {waitUntil:'networkidle2'});
    await new Promise(r=>setTimeout(r, 2000));

    const themes = [];
    for(let i=0; i<5; i++){
      const state = await page.evaluate(()=>({
        dataTheme: document.body.getAttribute('data-theme'),
        currentTheme: typeof currentTheme !== 'undefined' ? currentTheme : 'undefined',
        localStorageTheme: localStorage.getItem('theme')
      }));
      themes.push(state);
      console.log('ITERATION', i, 'BEFORE CLICK:', JSON.stringify(state));
      
      await page.click('.theme-toggle');
      await new Promise(r=>setTimeout(r, 500));
      
      const stateAfter = await page.evaluate(()=>({
        dataTheme: document.body.getAttribute('data-theme'),
        currentTheme: typeof currentTheme !== 'undefined' ? currentTheme : 'undefined',
        localStorageTheme: localStorage.getItem('theme')
      }));
      console.log('ITERATION', i, 'AFTER CLICK:', JSON.stringify(stateAfter));
    }
    
    console.log('CONSOLE MESSAGES:', JSON.stringify(consoleMessages.filter(m=>m.text.includes('theme')||m.text.includes('Theme')), null, 2));
    console.log(JSON.stringify({themes}));
  } catch(e){
    console.log(JSON.stringify({error:e.message,stack:e.stack}));
  }
  await browser.close();
})();
"@
node -e $themeScript

Write-Host "`n=== SIDEBAR TOGGLE DEBUG ===" -ForegroundColor Cyan
$sidebarScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('$ServerUrl/login', {waitUntil:'networkidle2', timeout:10000});
    await page.type('#username', '$Username');
    await page.type('#password', '$Password');
    await page.click('button[type=submit]');
    await page.waitForNavigation({waitUntil:'networkidle2'});
    await page.goto('$ServerUrl/dashboard', {waitUntil:'networkidle2'});
    await new Promise(r=>setTimeout(r, 1500));

    const before = await page.evaluate(()=>({
      bodyHasCollapsed: document.body.classList.contains('sidebar-collapsed'),
      bodyClasses: document.body.className,
      sidebarExists: !!document.querySelector('.sidebar'),
      toggleExists: !!document.querySelector('.sidebar-toggle'),
      localStorage: localStorage.getItem('sidebarCollapsed')
    }));
    console.log('BEFORE:', JSON.stringify(before, null, 2));
    
    await page.click('.sidebar-toggle');
    await new Promise(r=>setTimeout(r, 500));
    
    const after1 = await page.evaluate(()=>({
      bodyHasCollapsed: document.body.classList.contains('sidebar-collapsed'),
      bodyClasses: document.body.className,
      localStorage: localStorage.getItem('sidebarCollapsed')
    }));
    console.log('AFTER 1st CLICK:', JSON.stringify(after1, null, 2));
    
    await page.click('.sidebar-toggle');
    await new Promise(r=>setTimeout(r, 500));
    
    const after2 = await page.evaluate(()=>({
      bodyHasCollapsed: document.body.classList.contains('sidebar-collapsed'),
      bodyClasses: document.body.className,
      localStorage: localStorage.getItem('sidebarCollapsed')
    }));
    console.log('AFTER 2nd CLICK:', JSON.stringify(after2, null, 2));
    
  } catch(e){
    console.log(JSON.stringify({error:e.message}));
  }
  await browser.close();
})();
"@
node -e $sidebarScript

Write-Host "`n=== MODAL OPEN/CLOSE DEBUG ===" -ForegroundColor Cyan
$modalScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({type: msg.type(), text: msg.text()}));
  
  try {
    await page.goto('$ServerUrl/login', {waitUntil:'networkidle2', timeout:10000});
    await page.type('#username', '$Username');
    await page.type('#password', '$Password');
    await page.click('button[type=submit]');
    await page.waitForNavigation({waitUntil:'networkidle2'});
    await page.goto('$ServerUrl/dashboard', {waitUntil:'networkidle2'});
    await new Promise(r=>setTimeout(r, 1500));

    console.log('BEFORE OPEN:', JSON.stringify(await page.evaluate(()=>({
      modalExists: !!document.getElementById('widgetMarketplace'),
      modalDisplay: document.getElementById('widgetMarketplace')?.style.display,
      modalOffset: document.getElementById('widgetMarketplace')?.offsetWidth
    }))));
    
    await page.click('button[onclick*=\"addWidget\"]');
    await new Promise(r=>setTimeout(r, 500));
    
    console.log('AFTER OPEN:', JSON.stringify(await page.evaluate(()=>({
      modalDisplay: document.getElementById('widgetMarketplace')?.style.display,
      modalOffset: document.getElementById('widgetMarketplace')?.offsetWidth,
      closeBtnExists: !!document.querySelector('#widgetMarketplace button[onclick*=\"closeModal\"]'),
      allCloseBtns: document.querySelectorAll('button[onclick*=\"closeModal\"]').length
    }))));
    
    // Try click with evaluate
    await page.evaluate(()=>{
      const closeBtn = document.querySelector('#widgetMarketplace button[onclick*=\"closeModal\"]');
      console.log('Close button:', closeBtn, 'onclick:', closeBtn?.onclick);
      if(closeBtn) closeBtn.click();
    });
    
    await new Promise(r=>setTimeout(r, 500));
    
    console.log('AFTER CLOSE ATTEMPT:', JSON.stringify(await page.evaluate(()=>({
      modalDisplay: document.getElementById('widgetMarketplace')?.style.display,
      modalOffset: document.getElementById('widgetMarketplace')?.offsetWidth
    }))));
    
    console.log('CONSOLE:', JSON.stringify(consoleMessages.filter(m=>m.text.includes('modal')||m.text.includes('Modal')||m.text.includes('close')), null, 2));
    
  } catch(e){
    console.log(JSON.stringify({error:e.message}));
  }
  await browser.close();
})();
"@
node -e $modalScript
