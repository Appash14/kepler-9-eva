"""Public-preview check for every construction stage and the completion menu."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
URL=os.environ.get('URL','http://127.0.0.1:4351/')
async def main():
    errors=[];levels=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.on('response',lambda r:errors.append(f'HTTP {r.status} {r.url}') if r.status>=400 else None)
        await page.goto(URL+'?test=1&quality=high',wait_until='load')
        await page.wait_for_function('window.__eva?.state.ready',timeout=150000)
        await page.get_by_role('button',name='Jouer',exact=True).click()
        # Reach all cargos deterministically; input and cargo interaction were
        # verified separately. Construction must still use actual looted stock.
        for i,cargo in enumerate(await page.evaluate('__eva.state.cargo')):
            await page.evaluate('(p)=>__eva.debugTeleport(p,"ship")',cargo['position'])
            await page.keyboard.press('KeyE')
            await page.wait_for_function(f'__eva.simulation.state.collected === {i+1}')
        assert await page.evaluate('__eva.state.cargo.every(c=>!c.available)')
        await page.wait_for_function('document.querySelector("[data-ui=nav-cargo]").hidden')
        await page.evaluate('__eva.debugTeleport([10.7,1,47],"ship")')
        await page.keyboard.press('KeyE')
        await page.wait_for_function('__eva.state.mode==="human"')
        await page.keyboard.press('KeyI')
        expected={2:['forge','panneaux_solaires'],3:['serre'],4:['anneau_rotatif'],5:['observatoire','antennes']}
        for level,zones in expected.items():
            before=await page.evaluate('__eva.simulation.state.inventory')
            await page.locator('[data-action="build"]').click()
            await page.wait_for_function(f'__eva.simulation.state.level==={level}')
            result=await page.evaluate('({level:__eva.simulation.state.level,zones:__eva.world.stats.visibleZones,stock:__eva.simulation.state.inventory})')
            assert all(zone in result['zones'] for zone in zones),result
            assert result['stock']['metal']<before['metal']
            levels.append(result);print('OK level '+json.dumps(result),flush=True)
        assert await page.get_by_role('heading',name='La station vit',exact=True).is_visible()
        await page.keyboard.press('Escape')
        await page.wait_for_function('!__eva.state.paused')
        await page.evaluate('__eva.controller.state.yaw=Math.atan2(75,180);__eva.controller.state.pitch=-.177;__eva.debugTeleport([75,35,180],"ship")')
        await page.screenshot(path=str(ROOT/'captures/station-complete.png'),timeout=90000)
        report={'url':URL,'levels':levels,'errors':errors}
        (ROOT/'captures/progression.json').write_text(json.dumps(report,indent=2))
        await browser.close()
        assert not errors,errors
asyncio.run(main())
