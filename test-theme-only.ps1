param(
    [string]$ServerUrl = "http://localhost:10180",
    [string]$Username = "admin"
)

$Password = Read-Host "Enter password" -AsSecureString
$adminSecretValue = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password))

$themeScript = @"
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
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
    
    console.log('Waiting for theme to be applied...');
    await page.waitForFunction(() => document.body.hasAttribute('data-theme'), {timeout: 5000});
    await new Promise(r=>setTimeout(r, 500));

    // Check if toggleTheme function exists
    const hasFunction = await page.evaluate(()=>typeof window.toggleTheme === 'function');
    console.log('toggleTheme function exists:', hasFunction);
    
    // Capture initial theme
    const initialTheme = await page.evaluate(()=>document.body.getAttribute('data-theme'));
    console.log('Initial theme:', initialTheme);
    
    // Capture initial localStorage
    const initialStorage = await page.evaluate(()=>localStorage.getItem('theme'));
    console.log('Initial localStorage theme:', initialStorage);
    
    const themes = [];
    for(let i=0; i<5; i++){
      console.log('Click ' + (i+1) + '...');
      
      // Call toggleTheme directly
      await page.evaluate(()=>window.toggleTheme());
      
      // Wait for change
      await new Promise(r=>setTimeout(r, 600));
      
      const theme = await page.evaluate(()=>document.body.getAttribute('data-theme'));
      const storage = await page.evaluate(()=>localStorage.getItem('theme'));
      console.log('After click ' + (i+1) + ': data-theme=' + theme + ', localStorage=' + storage);
      
      themes.push(theme);
    }
    
    const expectedCycle = themes[0]==='light' && themes[1]==='dark' && themes[2]==='ocean' && themes[3]==='auto' && themes[4]==='light';
    console.log(JSON.stringify({success: expectedCycle, initialTheme, themes}));
  } catch(e){
    console.log(JSON.stringify({success:false, error: e.message}));
  }
  await browser.close();
})();
"@

Write-Host "`nTesting Theme Toggle..." -ForegroundColor Cyan
node -e $themeScript
