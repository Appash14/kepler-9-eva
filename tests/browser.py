import asyncio,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
CHROME=os.environ.get('CHROME_PATH') or None  # None : Chromium fourni par Playwright
URL=os.environ.get('URL','http://127.0.0.1:4350/')
async def main():
    errors=[]; checks=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=CHROME,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
        def observe(page):
            def error(message):
                errors.append(str(message)); print('ERROR '+str(message),flush=True)
            page.on('pageerror',error)
            page.on('console',lambda m:error(m.text) if m.type=='error' else None)
            page.on('response',lambda r:error('HTTP %s %s'%(r.status,r.url)) if r.status>=400 else None)
        def passed(name,data=None):
            checks.append({'name':name,'data':data}); print('OK '+name+' '+json.dumps(data),flush=True)
        page=await browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
        observe(page)
        try:
            await page.goto(URL+'?test=1&quality='+os.environ.get('DESKTOP_QUALITY','high'),wait_until='load')
            await page.wait_for_function('window.__eva?.state.ready',timeout=150000)
            await page.evaluate('document.fonts.ready')
            stats=await page.evaluate('__eva.world.stats')
            assert stats['glb'] and not stats['missingAssets'] and stats['kit']['erreurs']==0
            passed('assets and ready',stats)
            await page.screenshot(path=str(ROOT/'captures/intro-desktop.png'),timeout=90000)
            await page.get_by_role('button',name='Jouer',exact=True).click()
            await page.wait_for_function('__eva.state.playing && !__eva.state.paused')
            await page.keyboard.down('KeyW')
            await page.evaluate('for(let i=0;i<55;i++) __eva.debugStep(.05)')
            await page.wait_for_function('__eva.state.mode === "eva"',timeout=15000)
            await page.evaluate('for(let i=0;i<45;i++) __eva.debugStep(.05)')
            await page.keyboard.up('KeyW')
            position=await page.evaluate('__eva.controller.state.position.toArray()')
            assert position[0]<10.4,position
            passed('keyboard walk out of airlock changes human to EVA',position)
            await page.screenshot(path=str(ROOT/'captures/eva-desktop.png'),timeout=90000)
            await page.evaluate('__eva.debugTeleport([10.75,0,43],"human");__eva.debugStep(.05)')
            assert await page.evaluate('__eva.state.mode')=='human'
            passed('closed west wall keeps player pressurized')
            await page.evaluate('__eva.debugTeleport(__eva.world.originalShipPose.position.toArray(),"eva")')
            await page.keyboard.press('KeyE')
            await page.wait_for_function('__eva.state.mode === "ship"')
            await page.keyboard.down('KeyS')
            before=await page.evaluate('__eva.controller.state.position.toArray()')
            await page.evaluate('for(let i=0;i<80;i++) __eva.debugStep(.05)')
            await page.keyboard.up('KeyS')
            after=await page.evaluate('__eva.controller.state.position.toArray()')
            assert sum((a-b)**2 for a,b in zip(after,before))>25,(before,after)
            passed('board and fly ship with keyboard',{'before':before,'after':after})
            await page.evaluate('__eva.debugTeleport([-17,8,91],"ship")')
            await page.keyboard.press('KeyE')
            await page.wait_for_function('__eva.simulation.state.collected===1')
            inventory=await page.evaluate('__eva.simulation.state.inventory')
            assert inventory['metal']==11 and inventory['crystal']==2,inventory
            passed('cargo interaction gives actual stock',inventory)
            await page.screenshot(path=str(ROOT/'captures/ship-desktop.png'),timeout=90000)
            await page.evaluate('__eva.debugTeleport([10.7,1,47],"ship")')
            await page.keyboard.press('KeyE')
            await page.wait_for_function('__eva.state.mode === "human"')
            await page.keyboard.press('KeyI')
            await page.wait_for_function('__eva.state.paused')
            build=page.locator('[data-action="build"]')
            await build.click()
            await page.wait_for_function('__eva.simulation.state.level===2')
            level=await page.evaluate('({level:__eva.simulation.state.level,zones:__eva.world.stats.visibleZones,inventory:__eva.simulation.state.inventory})')
            assert 'forge' in level['zones'] and 'panneaux_solaires' in level['zones'],level
            assert level['inventory']['metal']==1 and level['inventory']['crystal']==0
            passed('dock, inventory and construction consume stock and expand world',level)
            await page.keyboard.press('Escape')
            await page.wait_for_function('!__eva.state.paused')
            await page.keyboard.press('Escape')
            paused=await page.evaluate('__eva.simulation.state.elapsed')
            await page.wait_for_timeout(900)
            assert paused==await page.evaluate('__eva.simulation.state.elapsed')
            passed('pause freezes survival')
            await page.keyboard.press('Escape')
            await page.evaluate('for(let i=0;i<500;i++) __eva.debugTick(1,{atBase:false,mode:"eva",moving:true})')
            drained=await page.evaluate('({oxygen:__eva.simulation.state.oxygen,energy:__eva.simulation.state.energy,food:__eva.simulation.state.food})')
            assert drained['oxygen']<60 and drained['food']<90 and drained['energy']<90,drained
            await page.keyboard.press('KeyF')
            await page.keyboard.press('KeyI')
            await page.locator('[data-action="eat"]').click()
            assert await page.evaluate('__eva.simulation.state.food')>drained['food']
            passed('survival drains and ration/refuel actions restore reserves',drained)
            await page.keyboard.press('Escape')
            await page.screenshot(path=str(ROOT/'captures/habitat-desktop.png'),timeout=90000)
            await page.evaluate('__eva.save()')
            await page.reload(wait_until='load')
            await page.wait_for_function('window.__eva?.state.ready',timeout=150000)
            saved=await page.evaluate('({level:__eva.simulation.state.level,collected:__eva.simulation.state.collected})')
            assert saved=={'level':2,'collected':1},saved
            passed('reload restores station and loot',saved)
            await page.close()
            mobile=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            phone=await mobile.new_page(); observe(phone)
            await phone.goto(URL+'?test=1',wait_until='load')
            await phone.wait_for_function('window.__eva?.state.ready',timeout=150000)
            assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
            await phone.screenshot(path=str(ROOT/'captures/intro-mobile.png'),timeout=90000)
            await phone.get_by_role('button',name='Jouer',exact=True).tap()
            await phone.wait_for_function('__eva.state.playing')
            stick=phone.locator('[data-ui="stick"]')
            assert await stick.is_visible()
            box=await stick.bounding_box()
            x=box['x']+box['width']/2; y=box['y']+box['height']/2
            cdp=await mobile.new_cdp_session(phone)
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-35,'id':1}]})
            before=await phone.evaluate('__eva.controller.state.position.toArray()')
            await phone.evaluate('for(let i=0;i<20;i++) __eva.debugStep(.05)')
            after=await phone.evaluate('__eva.controller.state.position.toArray()')
            assert sum((a-b)**2 for a,b in zip(after,before))>.1,(before,after)
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            passed('mobile portrait and native touch joystick movement',{'before':before,'after':after})
            await phone.screenshot(path=str(ROOT/'captures/habitat-mobile.png'),timeout=90000)
            await mobile.close()
        except Exception as e:
            errors.append(type(e).__name__+': '+str(e)[:900]); print('FAIL '+errors[-1],flush=True)
            if not page.is_closed():
                print(await page.evaluate('window.__eva ? ({runtime:__eva.state,position:__eva.controller.state.position.toArray(),controller: {active:__eva.controller.state.active,collided:__eva.controller.state.collided}}) : null'),flush=True)
                await page.screenshot(path=str(ROOT/'captures/error.png'),timeout=90000)
        (ROOT/'captures/browser.json').write_text(json.dumps({'checks':checks,'errors':errors,'checked_at':time.time()},indent=2))
        await browser.close()
        assert not errors,errors
asyncio.run(main())
