"""End-to-end playthrough with real clicks (Playwright, software GL). One browser at a time.
usage: python3 tools/playthrough.py [outdir] [base_url]
Needs `npm run preview` (port 4173). Writes numbered PNGs + a short log."""
import sys, time, os, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'screenshots/kern-b'
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:4173/'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

def run(w, h, tag, full):
    """Desktop: a sensible Jaar-1 run (garage + scanauto in Centrum, automaten, hires, tarief) from title to eindscherm."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, reduced_motion='reduce')
        pg = ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        n = [0]
        def shot(name, wait=1.2):
            n[0] += 1
            time.sleep(wait)
            pg.screenshot(path=f'{OUT}/{tag}-{n[0]:02d}-{name}.png', timeout=300000)
        def click(sel): pg.locator(sel).first.click(timeout=120000, force=True)
        def wait(sel, t=300000): pg.wait_for_selector(sel, state='visible', timeout=t)
        def xy(js): return pg.evaluate(js)
        def place(tool, wijk, small=False, k=0):
            click(f'.tool[data-tool="{tool}"]'); time.sleep(1)
            pos = xy(f'window.__game.lotXY("{wijk}", {k}, {str(small).lower()})')
            pg.mouse.move(pos['x'] - 4, pos['y'] - 4); time.sleep(0.4); pg.mouse.move(pos['x'], pos['y']); time.sleep(0.6)
            pg.mouse.click(pos['x'], pos['y']); time.sleep(1.5)
        def scan(wijk):
            click('.tool[data-tool="scanauto"]'); time.sleep(1)
            pg.evaluate(f"document.querySelector('.wchip[data-w=\"{wijk}\"]').click()"); time.sleep(1.5)
        def hire(*teams):
            for t in teams: click(f'[data-hire="{t}"].tc-hire'); time.sleep(0.5)
        def fix_teams(limit=5):
            # what a player does: look at the teambalk and hire where a card is not green
            for _ in range(limit):
                bad = pg.evaluate("[...document.querySelectorAll('#teambar .tc')].filter(c => !c.classList.contains('groen')).map(c => c.dataset.team)")
                if not bad: return
                for t in bad: click(f'[data-hire="{t}"].tc-hire'); time.sleep(0.4)
        def close_panel(sel): click(sel); time.sleep(0.6)
        def next_quarter(extra=None):
            click('#btn-next'); wait('#playbar:not(.hidden)')
            if extra: extra()
            click('#btn-skip'); wait('.card.afr'); shot('afrekening-q%d' % (xy('window.__game.session.results.length')), 4)
            click('#btn-continue')
        NOTUT = os.environ.get('NOTUT') == '1'
        if NOTUT:
            pg.goto(BASE + '?q=low&intro=0&play=1')
            pg.wait_for_function('window.__game && window.__game.ready', timeout=300000)
            time.sleep(2)
            place('garage', 'centrum')
        else:
            pg.goto(BASE + '?q=low&intro=0')
            pg.wait_for_function('window.__game && window.__game.ready', timeout=300000)
            time.sleep(2)
            shot('title')
            click('#btn-play')
            wait('#tutorial:not(.hidden)')
            time.sleep(4)
            shot('tut1-probleem')
            click('#tut-next'); shot('tut2-doel', 2.5)
            click('#tut-next'); shot('tut3-bouwen', 2.5)
            click('.tool[data-tool="garage"]'); time.sleep(2)
            shot('tut3b-bouwplek', 2)
            pos = xy('window.__game.lotXY("centrum", 0)')
            pg.mouse.move(pos['x'] - 5, pos['y'] - 5); time.sleep(0.5)
            pg.mouse.move(pos['x'], pos['y']); time.sleep(1)
            shot('hover')
            pg.mouse.click(pos['x'], pos['y']); time.sleep(2)
            wait('#tutorial:not(.hidden)')
            shot('tut4-volgend', 2.5)
            click('#tut-skip'); time.sleep(1)
        # Q1: scanauto + 3 stallings + first hires; look at the druk-kaart, teambalk and wijkpaneel
        shot('plan-q1-heatmap', 2)
        hire('schoonmaak', 'schoonmaak', 'schoonmaak', 'backoffice', 'handhaving')
        fix_teams()
        scan('centrum')
        click('#btn-heat'); time.sleep(1); shot('druk-kaart-uit', 1); click('#btn-heat'); time.sleep(1)
        # wijkpaneel: click the Noord label (ground click opens the panel)
        pg.evaluate("document.querySelector('.wchip[data-w=kuipwijk]').click()"); time.sleep(1.5)
        pg.mouse.move(760, 200); shot('wijkpaneel', 1.5); close_panel('#sidepanel [data-close]')
        place('stalling', 'centrum', True, 1)
        place('stalling', 'kopbrug', True)
        place('stalling', 'kuipwijk', True)
        # voorspelling: hover a garage spot in noord with the garage tool
        click('.tool[data-tool="automaat"]'); time.sleep(1)
        pos = xy('window.__game.lotXY("centrum", 2, true)') or xy('window.__game.lotXY("centrum", 0, true)')
        pg.mouse.move(pos['x'] - 4, pos['y'] - 4); time.sleep(0.4); pg.mouse.move(pos['x'], pos['y']); time.sleep(1.2)
        shot('voorspelling-hover', 1)
        click('#btn-cancel'); time.sleep(0.5)
        # voorspelling bij beleid
        click('#btn-beleid'); time.sleep(1)
        pg.locator('[data-pol="kuipwijk:midden"]').first.hover(); time.sleep(1.2)
        shot('voorspelling-beleid', 1)
        close_panel('#sidepanel [data-close]')
        shot('plan-q1', 1.5)
        next_quarter(lambda: (time.sleep(5), shot('spelen', 1)))
        time.sleep(3)
        # Q2: dilemma
        wait('.card.dilemma'); print('modal', xy("document.getElementById('modal').className")); shot('dilemma', 3)
        click('.dl-opt[data-choice="nee"]'); time.sleep(1.5)
        shot('plan-q2-sap', 3)
        place('stalling', 'noord', True)
        hire('klantcontact', 'backoffice')
        fix_teams()
        next_quarter()
        time.sleep(3)
        # Q3: announcement
        wait('.card.dilemma'); shot('marathon-aankondiging', 1.5)
        click('#btn-ok'); time.sleep(1.5)
        click('#btn-beleid'); time.sleep(1)
        click('[data-pol="kuipwijk:midden"]'); time.sleep(0.8)
        close_panel('#sidepanel [data-close]')
        hire('klantcontact', 'backoffice', 'handhaving')
        fix_teams()
        shot('plan-q3', 1.5)
        next_quarter()
        time.sleep(3)
        # Q4: Moment panel (opens by itself), partners first, then two measures
        wait('.mo-partner'); time.sleep(1)
        click('.pick[data-pick="evenementtarief"]'); time.sleep(0.6)
        click('.pick[data-pick="brief"]'); time.sleep(0.6)
        shot('moment-paneel', 1.2)
        close_panel('#sidepanel [data-close]')
        click('#btn-beleid'); time.sleep(1)
        click('[data-pol="centrum:hoog"]'); time.sleep(0.8)
        close_panel('#sidepanel [data-close]')
        fix_teams()
        shot('plan-q4-marathon', 1.5)
        next_quarter(lambda: (xy('window.__game.advance(7)'), shot('spelen-marathon', 1)))
        wait('.card.eind', t=300000); time.sleep(4)
        shot('eindscherm', 2)
        print(tag, 'phase', xy('window.__game.phase'), 'errors:', errs[:5])
        b.close()

def run_phone():
    """Phone (390x844, touch): plan, voorspelling, afrekening."""
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=1, reduced_motion='reduce')
        pg = ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        n = [0]
        def shot(name):
            n[0] += 1; time.sleep(0.8)
            pg.screenshot(path=f'{OUT}/m-{n[0]:02d}-{name}.png', timeout=300000)
        def tap(sel): pg.locator(sel).first.tap(timeout=120000, force=True)
        def wait(sel, t=240000): pg.wait_for_selector(sel, state='visible', timeout=t)
        pg.goto(BASE + '?q=low')
        pg.wait_for_function('window.__game && window.__game.ready', timeout=300000)
        time.sleep(1); shot('title')
        tap('#btn-play'); wait('#tutorial:not(.hidden)'); time.sleep(3); shot('tut1')
        tap('#tut-next'); time.sleep(1); shot('tut2-doel')
        tap('#tut-next'); time.sleep(1)
        tap('.tool[data-tool="garage"]'); time.sleep(1); shot('tut3-bouwplek')
        pos = pg.evaluate('window.__game.lotXY("centrum", 0)')
        pg.touchscreen.tap(pos['x'], pos['y']); time.sleep(1.5); shot('plan-q1')
        time.sleep(1); shot('plan-q1')
        pg.evaluate("document.querySelector('#btn-beleid').click()"); time.sleep(1)
        pg.evaluate("document.querySelector('[data-pol=\"kuipwijk:midden\"]').click()"); time.sleep(1.2); shot('voorspelling')
        pg.evaluate("document.querySelector('#sidepanel [data-close]').click()"); time.sleep(0.6)
        tap('#btn-next'); wait('#playbar:not(.hidden)'); time.sleep(2)
        tap('#btn-skip'); wait('.card.afr'); time.sleep(2); shot('afrekening-q1')
        print('phone errors:', errs[:5])
        b.close()

if __name__ == '__main__':
    which = sys.argv[3] if len(sys.argv) > 3 else 'desktop'
    if which == 'desktop': run(1440, 900, 'd', True)
    else: run_phone()
