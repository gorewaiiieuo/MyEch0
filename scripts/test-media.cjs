// Independent local test instance only. No production account or content is used.
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

const base = 'http://127.0.0.1:6279'
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex')
const out = path.join(__dirname, '../test-output/media')

async function main() {
  await fs.mkdir(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 960 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    // Deterministic synthetic sample: background canvas recording can yield zero frames.
    const motion = await fs.readFile(path.join(__dirname, '../web/tests/fixtures/synthetic-motion.jpg'))
    await fs.writeFile(path.join(out, 'test-original-motion.jpg'), motion)
    console.log('Fixture:', { bytes: motion.length, sha256: hash(motion) })

    const username = 'media-validation'
    const password = 'LocalEch0TestOnly.2026!'
    const status = await (await context.request.get(`${base}/api/init/status`)).json()
    if (!status.data.initialized) {
      const owner = await context.request.post(`${base}/api/init/owner`, { data: { username, password, email: 'test@example.invalid', locale: 'zh-CN', site_title: '功能验证（独立测试）' } })
      const ownerBody = await owner.json()
      assert.equal(ownerBody.code, 1, `initialize isolated test: ${ownerBody.msg}`)
    }
    const login = await context.request.post(`${base}/api/login`, { data: { username, password } })
    const auth = await login.json()
    assert.equal(auth.code, 1, 'test owner login')
    const headers = { Authorization: `Bearer ${auth.data.access_token}` }

    const upload = await context.request.post(`${base}/api/files/upload`, { headers, multipart: {
      category: 'image', storage_type: 'local', file: { name: 'test-original-motion.jpg', mimeType: 'image/jpeg', buffer: motion },
    } })
    const uploaded = await upload.json()
    assert.equal(uploaded.code, 1, 'upload accepted')
    const file = uploaded.data
    const returned = await context.request.get(new URL(file.url, base).href)
    assert.equal(hash(await returned.body()), hash(motion), 'uploaded bytes must survive storage and HTTP serving')

    const saved = await context.request.post(`${base}/api/echo`, { headers, data: { content: '动态照片与原图下载验证', private: false, layout: 'waterfall', echo_files: [{ file_id: file.id, sort_order: 0 }] } })
    const savedBody = await saved.json()
    assert.equal(savedBody.code, 1, `create echo: ${JSON.stringify(savedBody)}`)

    await page.goto(base)
    await page.locator('.image-gallery-container img').first().waitFor()
    await page.locator('.image-gallery-container button').first().click()
    const motionButton = page.locator('.pswp__button--motion-photo')
    await motionButton.waitFor({ state: 'visible' })
    await motionButton.click()
    await page.waitForFunction(() => {
      const video = document.querySelector('.pswp video')
      return video && video.readyState >= 2 && video.currentTime > 0 && video.getBoundingClientRect().width >= 300 && video.getBoundingClientRect().height >= 200
    })
    await page.waitForTimeout(450)
    await page.screenshot({ path: path.join(out, 'media-motion-playback.png') })
    await page.getByRole('button', { name: '查看静态图' }).click()
    assert.equal(await page.locator('.pswp video').count(), 0, 'still toggle removes video')
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载原图' }).click()
    const download = await downloadEvent
    assert.equal(download.suggestedFilename(), 'test-original-motion.jpg', 'original filename is retained')
    const downloadedPath = path.join(out, 'test-downloaded-original.jpg')
    await download.saveAs(downloadedPath)
    assert.equal(hash(await fs.readFile(downloadedPath)), hash(motion), 'downloaded original must be identical')
    await page.keyboard.press('Escape')

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, locale: 'zh-CN' })
    const mobilePage = await mobileContext.newPage()
    mobilePage.on('pageerror', (error) => errors.push(error.message))
    await mobilePage.goto(base)
    const thumbnail = mobilePage.locator('.image-gallery-container button').first()
    await thumbnail.waitFor()
    const touch = await mobileContext.newCDPSession(mobilePage)
    const hold = async (locator) => {
      const box = await locator.boundingBox()
      assert.ok(box, 'held image is visible')
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
    }
    await hold(thumbnail)
    await mobilePage.waitForFunction(() => {
      const video = document.querySelector('.motion-photo-press-video')
      return video && video.currentTime > 0 && !video.paused
    })
    await mobilePage.screenshot({ path: path.join(out, 'mobile-hold-thumbnail.png') })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.equal(await mobilePage.locator('.motion-photo-press-video').count(), 0, 'release restores still thumbnail')
    assert.equal(await mobilePage.locator('.pswp').count(), 0, 'long hold must not open the gallery')
    await mobilePage.waitForTimeout(750)
    await thumbnail.tap()
    await mobilePage.locator('.pswp__button--motion-photo').waitFor({ state: 'visible' })
    await hold(mobilePage.locator('.pswp__img:visible').last())
    await mobilePage.waitForFunction(() => {
      const video = document.querySelector('.pswp video')
      return video && video.currentTime > 0 && !video.paused
    })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    assert.equal(await mobilePage.locator('.pswp video').count(), 0, 'release restores still in fullscreen')
    const phoneDownload = mobilePage.waitForEvent('download')
    await mobilePage.getByRole('button', { name: '下载原图' }).tap()
    const phoneFile = await phoneDownload
    assert.equal(phoneFile.suggestedFilename(), 'test-original-motion.jpg')
    const phonePath = path.join(out, 'test-mobile-original.jpg')
    await phoneFile.saveAs(phonePath)
    assert.equal(hash(await fs.readFile(phonePath)), hash(motion), 'mobile native download keeps original bytes')
    await mobileContext.close()

    const settingsResponse = await context.request.get(`${base}/api/settings`)
    const settings = (await settingsResponse.json()).data
    const updated = await context.request.put(`${base}/api/settings`, { headers, data: { ...settings, amap_key: 'test-browser-key', amap_security_code: 'test-browser-code' } })
    assert.equal((await updated.json()).code, 1, 'map settings persist')
    const reread = (await (await context.request.get(`${base}/api/settings`)).json()).data
    assert.equal(reread.amap_key, 'test-browser-key')
    // AMap calls are mocked because no operator key is available. This verifies
    // UI wiring and coordinate persistence, not the external service/network.
    await page.route('https://webapi.amap.com/**', async (route) => route.fulfill({ contentType: 'text/javascript', body: `
      const position = {getLat:()=>22.533,getLng:()=>113.58};
      window.AMap={
        plugin:(_names,ready)=>ready(),
        Map:class{constructor(el){this.el=el;el.style.background='#e4ece5';el.textContent='地图接口模拟验证';}on(){}setZoomAndCenter(){}zoomIn(){}zoomOut(){}destroy(){this.el.textContent='';}},
        Marker:class{setPosition(){}setMap(){}},
        PlaceSearch:class{
          search(keyword,cb){window.lastMapSearch={method:'global',keyword};cb('complete',{poiList:{pois:[{id:'port',name:'中山港码头',address:'广东省中山市',location:position}]}})}
          searchNearBy(keyword,center,radius,cb){window.lastMapSearch={method:'nearby',keyword,center,radius};cb('complete',{poiList:{pois:[{id:'nearby',name:'麦当劳（附近测试店）',address:'广东省珠海市',location:position}]}})}
        },
        Geocoder:class{getAddress(_p,cb){cb('complete',{regeocode:{formattedAddress:'广东省中山市测试位置'}})}},
        Geolocation:class{getCurrentPosition(cb){cb('complete',{position,formattedAddress:'一键定位测试地点',location_type:'h5',accuracy:15})}}
      };` }))
    await page.reload()
    await page.locator('a[href="/?tab=publish"]:visible').first().click()
    // Open the publish editor using the visible navigation affordance if needed.
    const locationButton = page.getByRole('button', { name: '添加位置', exact: true })
    await locationButton.waitFor({ state: 'visible' })
    if (!await locationButton.count()) {
      console.log('Visible buttons:', await page.locator('button').evaluateAll((buttons) => buttons.map((b) => ({ label: b.getAttribute('aria-label'), title: b.getAttribute('title'), text: b.textContent?.trim() })).slice(0, 35)))
      throw new Error('Need to open editor through its navigation button')
    }
    const attachment = page.getByRole('button', { name: '添加附件', exact: true })
    assert.equal(await attachment.count(), 1, 'attachment is alongside location')
    await locationButton.click()
    await page.getByPlaceholder('输入地名，例如：中山港码头').fill('中山港')
    await page.getByRole('button', { name: '搜索地点', exact: true }).click()
    await page.getByRole('button', { name: /中山港码头.*广东省中山市/ }).click()
    assert.match(await page.locator('textarea').last().inputValue(), /中山港码头/)
    await page.getByRole('button', { name: '获取当前位置', exact: true }).click()
    await page.waitForFunction(() => Array.from(document.querySelectorAll('textarea')).some((el) => el.value === '一键定位测试地点'))
    await page.getByPlaceholder('输入地名，例如：中山港码头').fill('麦当劳')
    await page.getByRole('button', { name: '搜索地点', exact: true }).click()
    await page.getByRole('button', { name: /麦当劳（附近测试店）.*广东省珠海市/ }).waitFor()
    const nearby = await page.evaluate(() => window.lastMapSearch)
    assert.equal(nearby.method, 'nearby', 'locating changes keyword search to nearby search')
    assert.equal(nearby.radius, 10000)
    assert.ok(Math.abs(nearby.center[0] - 113.58) < 0.000001, 'AMap receives the located GCJ02 longitude')
    assert.ok(Math.abs(nearby.center[1] - 22.533) < 0.000001, 'AMap receives the located GCJ02 latitude')
    await page.screenshot({ path: path.join(out, 'media-location-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(out, 'media-location-mobile.png') })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile page should fit')
    const locationSaved = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/echo' && response.request().method() === 'POST')
    await page.getByRole('button', { name: '发布Echo', exact: true }).click()
    await page.getByRole('button', { name: '公开发布', exact: true }).click()
    const locationResponse = await locationSaved
    assert.equal((await locationResponse.json()).code, 1, 'selected location publishes')
    const locationPayload = JSON.stringify(locationResponse.request().postDataJSON())
    assert.match(locationPayload, /一键定位测试地点/)
    assert.match(locationPayload, /22\.5360/)
    assert.deepEqual(errors, [], 'no uncaught browser errors')
    await fs.writeFile(path.join(out, 'media-cn-e2e-result.json'), JSON.stringify({ passed: true, originalBytes: motion.length, originalSha256: hash(motion), downloadedSha256: hash(await fs.readFile(downloadedPath)), playback: true, mapProvider: 'AMap (mocked)', nearbySearch: true, mobileNativeDownload: true, mobileHoldThumbnail: true, mobileHoldFullscreen: true, mobileWidth: 390 }, null, 2))
    console.log('PASS: original upload/download hashes match; embedded MP4 plays; location controls and search work with SDK fixture; mobile fits.')
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'media-e2e-failure.png') }).catch(() => {})
    console.error(error)
    process.exitCode = 1
  } finally { await browser.close() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
