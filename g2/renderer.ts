// Renderer for displaying content on Even G2 glasses
import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { executeSerialized, resetBridgeSerializer } from '../_shared/bridge-serializer'
import { formatBacGdl, formatDrinkEntryTime, getBacEstimateAt, getDrinkEntryEndTimestampMs, getStandbyCountdown, state, getBridge, METABOLISM_LEVEL_LABELS, type BacEstimate, type MenuItem } from './state'

const MENU_ITEMS: { id: MenuItem; label: string }[] = [
  { id: 'standBy', label: 'Stand by' },
  { id: 'adddrink', label: 'Log a drink' },
  { id: 'setupdrink', label: 'Summary' },
  { id: 'presets', label: 'Presets' },
]

const ADD_DRINK_MENU_ITEMS = [
  'Add drink',
  '+ ml',
  '- ml',
  '+ %',
  '- %',
]

let containersCreated = false
type LayoutMode = 'main-menu' | 'adddrink-menu' | 'presets-menu' | 'detail' | 'standby-detail'
let currentLayoutMode: LayoutMode | null = null
let standbyHudHidden = false

type RenderFailureHandler = (err: unknown) => void
let renderFailureHandler: RenderFailureHandler | null = null
let consecutiveRenderFailures = 0
const RENDER_FAILURE_THRESHOLD = 3
const RENDER_TIMEOUT_MS = 5000

// Lets the connection manager (main.ts) learn about repeated, unrecoverable
// send failures so it can verify bridge viability and trigger a reconnect.
export function setRenderFailureHandler(handler: RenderFailureHandler | null): void {
  renderFailureHandler = handler
}

const SCREEN_WIDTH = 576
const SCREEN_HEIGHT = 288
const SIDE_WIDTH = SCREEN_WIDTH / 2
const SIDE_HEIGHT = 30
const TOP_RIGHT_WIDTH = 72
const TOP_RIGHT_X = SCREEN_WIDTH - TOP_RIGHT_WIDTH
const BOTTOM_RIGHT_WIDTH = 96
const BOTTOM_RIGHT_X = SCREEN_WIDTH - BOTTOM_RIGHT_WIDTH
const MAIN_Y = SIDE_HEIGHT
const MAIN_HEIGHT = SCREEN_HEIGHT - 2 * SIDE_HEIGHT
const MAIN_WIDTH = SCREEN_WIDTH / 2
const MAX_RIGHT_HISTORY_LINES = 8
const MAX_RIGHT_CONTENT_CHARS = 900

type PageConfig = {
  containerTotalNum: number
  textObject?: TextContainerProperty[]
  listObject?: ListContainerProperty[]
}

type TextUpgradeTarget = {
  containerID: number
  containerName: string
  content: string
}

function trimForRebuild(content: string): string {
  if (content.length <= MAX_RIGHT_CONTENT_CHARS) return content
  return `${content.slice(0, MAX_RIGHT_CONTENT_CHARS - 3)}...`
}

function runSerializedRender(task: () => Promise<void>): Promise<void> {
  return executeSerialized(task, RENDER_TIMEOUT_MS, 'render')
    .then(() => {
      consecutiveRenderFailures = 0
    })
    .catch((err) => {
      console.warn('[bacpacer] render operation failed', err)
      appendEventLog('Renderer: operation failed')
      consecutiveRenderFailures += 1

      if (consecutiveRenderFailures >= RENDER_FAILURE_THRESHOLD) {
        consecutiveRenderFailures = 0
        if (renderFailureHandler) {
          try {
            renderFailureHandler(err)
          } catch (handlerErr) {
            console.warn('[bacpacer] render failure handler threw', handlerErr)
          }
        }
      }
    })
}

function isStandbyDetailContext(): boolean {
  return !state.menuVisible && state.currentMenuItem === 'standBy'
}

export function isStandbyHudHidden(): boolean {
  return standbyHudHidden
}

export function toggleStandbyHudVisibility(): boolean {
  if (!isStandbyDetailContext()) return standbyHudHidden
  standbyHudHidden = !standbyHudHidden
  return standbyHudHidden
}

export function resetStandbyHudVisibility(): void {
  standbyHudHidden = false
}

function getTopLeftContent(): string {
  if (isStandbyDetailContext()) {
    if (standbyHudHidden) return ' '
    return formatDrinkEntryTime(Date.now())
  }

  return state.menuVisible
    ? (state.addDrinkSubmenuVisible ? 'Log a drink' : 'Menu')
    : getDetailTitle(state.currentMenuItem)
}

function getTopRightContent(): string {
  if (standbyHudHidden && isStandbyDetailContext()) return ' '

  const countdown = getStandbyCountdown(Date.now())
  if (!countdown) return ' '
  if (countdown.activeMinutes > 0 && countdown.carryOverMinutes > 0) {
    return `${countdown.activeMinutes} +${countdown.carryOverMinutes}`
  }
  if (countdown.carryOverMinutes > 0) {
    return `+ ${countdown.carryOverMinutes}`
  }

  const remainingMinutes = countdown.activeMinutes > 0
    ? countdown.activeMinutes
    : countdown.carryOverMinutes
  if (remainingMinutes <= 0) return ' '
  return `${remainingMinutes}`
}

function getBacTrendMarker(isRisingToPeak: boolean, bacGdl: number): string {
  if (bacGdl <= 0) return ''
  return isRisingToPeak ? ' ↗' : ' ↘'
}

function getMainRightContent(estimate: BacEstimate = getBacEstimateAt()): string {
  const inSummaryContext = !state.menuVisible && state.currentMenuItem === 'setupdrink'
  if (inSummaryContext) {
    const currentBac = formatBacGdl(estimate.bacGdl)
    const peakBac = formatBacGdl(estimate.peakBacGdl)
    const peakAt = estimate.peakAtMs ? formatDrinkEntryTime(estimate.peakAtMs) : '--:--'
    const soberAt = estimate.estimatedSoberAtMs ? formatDrinkEntryTime(estimate.estimatedSoberAtMs) : '--:--'
    const trendMarker = getBacTrendMarker(estimate.isRisingToPeak, estimate.bacGdl)
    const secondaryLine = estimate.isRisingToPeak
      ? `Peak BAC at ${peakAt}: ${peakBac}`
      : 'Peak BAC: ↘'

    return trimForRebuild([
      `Current BAC: ${currentBac}${trendMarker}`,
      secondaryLine,
      `Sober at ${soberAt}`,
    ].join('\n\n'))
  }

  const inAddDrinkContext = state.addDrinkSubmenuVisible || (!state.menuVisible && state.currentMenuItem === 'adddrink')
  if (inAddDrinkContext) {
    const latest = `${state.drinkMl} ml    ${state.drinkPercent} %`
    const historyLines = state.drinkEntries.slice(0, MAX_RIGHT_HISTORY_LINES).map((entry) => {
      const start = formatDrinkEntryTime(entry.timestampMs)
      const end = formatDrinkEntryTime(getDrinkEntryEndTimestampMs(entry))
      return `${start}-${end}  ${entry.ml} ml  ${entry.percent}%`
    })

    const history = historyLines.length > 0
      ? historyLines.join('\n')
      : 'No drinks stored yet'

    return trimForRebuild(`${latest}\n\nDrinks:\n${history}`)
  }

  const inPresetsContext = !state.menuVisible && state.currentMenuItem === 'presets'
  if (inPresetsContext) {
    if (state.drinkPresets.length === 0) {
      return 'Add presets from phone'
    }

    return trimForRebuild([
      `Current: ${state.drinkMl} ml  ${state.drinkPercent}%`,
      '',
      'Tap a preset to load it',
    ].join('\n'))
  }

  return ' '
}

function getBottomRightContent(estimate: BacEstimate = getBacEstimateAt()): string {
  if (standbyHudHidden && isStandbyDetailContext()) return ' '

  if (estimate.bacGdl <= 0) return ' '

  const trendMarker = getBacTrendMarker(estimate.isRisingToPeak, estimate.bacGdl)
  return `${formatBacGdl(estimate.bacGdl)}${trendMarker}`
}

function getBottomLeftContent(estimate: BacEstimate = getBacEstimateAt()): string {
  if (standbyHudHidden && isStandbyDetailContext()) return ' '

  if (estimate.bacGdl <= 0 || !estimate.isRisingToPeak) return ' '

  const peakBac = formatBacGdl(estimate.peakBacGdl)
  const peakAt = estimate.peakAtMs ? formatDrinkEntryTime(estimate.peakAtMs) : '--:--'
  return `Peak BAC ${peakBac} at ${peakAt}`
}

function buildStaticTextContainers(): TextContainerProperty[] {
  const estimate = getBacEstimateAt()

  return [
    new TextContainerProperty({
      containerID: 1,
      containerName: 'TopLeft',
      content: getTopLeftContent(),
      xPosition: 0,
      yPosition: 0,
      width: SIDE_WIDTH,
      height: SIDE_HEIGHT,
    }),
    new TextContainerProperty({
      containerID: 2,
      containerName: 'TopRight',
      content: getTopRightContent(),
      xPosition: TOP_RIGHT_X,
      yPosition: 0,
      width: TOP_RIGHT_WIDTH,
      height: SIDE_HEIGHT,
    }),
    new TextContainerProperty({
      containerID: 4,
      containerName: 'MainRight',
      content: getMainRightContent(estimate),
      xPosition: MAIN_WIDTH,
      yPosition: MAIN_Y,
      width: MAIN_WIDTH,
      height: MAIN_HEIGHT,
    }),
    new TextContainerProperty({
      containerID: 5,
      containerName: 'BottomLeft',
      content: getBottomLeftContent(estimate),
      xPosition: 0,
      yPosition: SCREEN_HEIGHT - SIDE_HEIGHT,
      width: SIDE_WIDTH,
      height: SIDE_HEIGHT,
    }),
    new TextContainerProperty({
      containerID: 6,
      containerName: 'BottomRight',
      content: getBottomRightContent(estimate),
      xPosition: BOTTOM_RIGHT_X,
      yPosition: SCREEN_HEIGHT - SIDE_HEIGHT,
      width: BOTTOM_RIGHT_WIDTH,
      height: SIDE_HEIGHT,
    }),
  ]
}

async function createPage(config: PageConfig): Promise<number | null> {
  const b = getBridge()
  if (!b) return null

  const result = await b.createStartUpPageContainer(new CreateStartUpPageContainer(config))
  if (result === 0) {
    containersCreated = true
    return 0
  }

  appendEventLog(`Renderer: create failed code=${String(result)}`)
  return result
}

async function rebuildPage(config: PageConfig): Promise<boolean> {
  const b = getBridge()
  if (!b) return false

  return b.rebuildPageContainer(new RebuildPageContainer(config))
}

async function applyPage(config: PageConfig): Promise<boolean> {
  // First render in this runtime.
  if (!containersCreated) {
    const created = await createPage(config)
    if (created === 0) return true

    // Some firmware rejects repeated startup-create with code 1 even when
    // a page exists. Retry rebuild as a recovery path.
    if (created === 1) {
      containersCreated = true
      appendEventLog('Renderer: create code=1, retrying rebuild')
      return rebuildPage(config)
    }

    return false
  }

  // Normal path: rebuild existing page.
  const rebuilt = await rebuildPage(config)
  if (rebuilt) return true

  // Recovery path: page may have been torn down or lost; recreate.
  appendEventLog('Renderer: rebuild failed, retrying create')
  containersCreated = false
  const recreated = await createPage(config)
  if (recreated === 0) return true

  if (recreated === 1) {
    containersCreated = true
    appendEventLog('Renderer: recreate code=1, retrying rebuild')
    return rebuildPage(config)
  }

  return false
}

async function updateTopRightCountdownOnlyInternal(): Promise<void> {
  await upgradeTextContainerInternal({
    containerID: 2,
    containerName: 'TopRight',
    content: getTopRightContent(),
  })
}

async function updateRightDynamicContentOnlyInternal(): Promise<void> {
  if (!containersCreated) return

  await updateTopRightCountdownOnlyInternal()
  if (!containersCreated) return
  const estimate = getBacEstimateAt()

  const topLeftUpdated = await upgradeTextContainerInternal({
    containerID: 1,
    containerName: 'TopLeft',
    content: getTopLeftContent(),
  })
  if (!topLeftUpdated) return

  const mainRightUpdated = await upgradeTextContainerInternal({
    containerID: 4,
    containerName: 'MainRight',
    content: getMainRightContent(estimate),
  })
  if (!mainRightUpdated) return

  const bottomLeftUpdated = await upgradeTextContainerInternal({
    containerID: 5,
    containerName: 'BottomLeft',
    content: getBottomLeftContent(estimate),
  })
  if (!bottomLeftUpdated) return

  await upgradeTextContainerInternal({
    containerID: 6,
    containerName: 'BottomRight',
    content: getBottomRightContent(estimate),
  })
}

async function upgradeTextContainerInternal(target: TextUpgradeTarget): Promise<boolean> {
  const b = getBridge()
  if (!b || !containersCreated) return false

  const upgraded = await b.textContainerUpgrade(new TextContainerUpgrade({
    containerID: target.containerID,
    containerName: target.containerName,
    contentOffset: 0,
    contentLength: 0,
    content: target.content,
  }))

  if (upgraded) return true

  appendEventLog(`Renderer: text upgrade failed id=${target.containerID} name=${target.containerName}`)

  // Mark renderer state as stale so the next display pass recreates layout.
  containersCreated = false
  currentLayoutMode = null
  return false
}

async function updateMenuDisplayInternal(): Promise<void> {
  if (!getBridge()) return

  if (!isStandbyDetailContext() && standbyHudHidden) {
    standbyHudHidden = false
  }

  const targetLayoutMode: LayoutMode = !state.menuVisible
    ? (state.currentMenuItem === 'standBy' ? 'standby-detail' : (state.currentMenuItem === 'presets' ? 'presets-menu' : 'detail'))
    : (state.addDrinkSubmenuVisible ? 'adddrink-menu' : 'main-menu')

  const needsFullLayoutRender = !containersCreated || targetLayoutMode !== currentLayoutMode
  appendEventLog(
    `Renderer: menuDisplay target=${targetLayoutMode} current=${currentLayoutMode ?? 'none'} fullRender=${String(needsFullLayoutRender)} menuVisible=${String(state.menuVisible)} addSub=${String(state.addDrinkSubmenuVisible)} currentItem=${state.currentMenuItem}`,
  )

  if (needsFullLayoutRender) {
    let rendered = false
    if (targetLayoutMode === 'standby-detail') {
      rendered = await showStandbyDetailLayout()
    } else if (targetLayoutMode === 'presets-menu') {
      rendered = await showPresetsMenuListLayout()
    } else if (targetLayoutMode === 'detail') {
      const body = getScreenBody(state.currentMenuItem)
      rendered = await showDetailLayout(body)
    } else if (targetLayoutMode === 'adddrink-menu') {
      rendered = await showAddDrinkMenuListLayout()
    } else {
      rendered = await showMainMenuListLayout()
    }

    if (rendered) {
      currentLayoutMode = targetLayoutMode
      appendEventLog(`Renderer: layout-applied mode=${targetLayoutMode}`)
    } else {
      // Keep previous mode when render fails to avoid UI/state desync.
      appendEventLog(`Renderer: layout-failed mode=${targetLayoutMode}`)
      return
    }
  } else if (targetLayoutMode === 'detail') {
    // Same detail layout: update only text content without rebuilding page.
    const body = getScreenBody(state.currentMenuItem)
    const detailUpdated = await upgradeTextContainerInternal({
      containerID: 3,
      containerName: 'MainLeftDetail',
      content: body,
    })
    if (!detailUpdated) return
  }

  const topLeftUpdated = await upgradeTextContainerInternal({
    containerID: 1,
    containerName: 'TopLeft',
    content: getTopLeftContent(),
  })
  if (!topLeftUpdated) return

  await updateRightDynamicContentOnlyInternal()
}

async function showMenuListLayout(items: string[], name: string): Promise<boolean> {
  const textContainers = buildStaticTextContainers()

  const menuList = new ListContainerProperty({
    containerID: 3,
    containerName: name,
    xPosition: 0,
    yPosition: MAIN_Y,
    width: MAIN_WIDTH,
    height: MAIN_HEIGHT,
    paddingLength: 4,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: MAIN_WIDTH - 10,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })

  return applyPage({
    containerTotalNum: 6,
    textObject: textContainers,
    listObject: [menuList],
  })
}

async function showMainMenuListLayout(): Promise<boolean> {
  return showMenuListLayout(MENU_ITEMS.map(item => item.label || 'Stand by'), 'MainLeftMenu')
}

async function showAddDrinkMenuListLayout(): Promise<boolean> {
  return showMenuListLayout(ADD_DRINK_MENU_ITEMS, 'AddDrinkMenu')
}

function getPresetMenuItems(): string[] {
  if (state.drinkPresets.length === 0) {
    return ['No presets saved']
  }

  return state.drinkPresets.map((preset) => `${preset.ml} ml  ${preset.percent}%`)
}

async function showPresetsMenuListLayout(): Promise<boolean> {
  return showMenuListLayout(getPresetMenuItems(), 'PresetMenu')
}

async function showStandbyDetailLayout(): Promise<boolean> {
  const textContainers = [
    ...buildStaticTextContainers(),
    new TextContainerProperty({
      containerID: 3,
      containerName: 'StandbyTapCap',
      content: ' ',
      xPosition: 0,
      yPosition: MAIN_Y,
      width: MAIN_WIDTH,
      height: MAIN_HEIGHT,
      isEventCapture: 1,
    }),
  ]

  return applyPage({
    containerTotalNum: 6,
    textObject: textContainers,
  })
}

async function showDetailLayout(body: string): Promise<boolean> {
  const textContainers = [
    ...buildStaticTextContainers(),
    new TextContainerProperty({
      containerID: 3,
      containerName: 'MainLeftDetail',
      content: body,
      xPosition: 0,
      yPosition: MAIN_Y,
      width: MAIN_WIDTH,
      height: MAIN_HEIGHT,
      isEventCapture: 1,
    }),
  ]

  return applyPage({
    containerTotalNum: 6,
    textObject: textContainers,
  })
}

export function menuItemFromIndex(index: number): MenuItem | undefined {
  return MENU_ITEMS[index]?.id
}

export function addDrinkSubmenuItemFromIndex(index: number): string | undefined {
  return ADD_DRINK_MENU_ITEMS[index]
}

function getMenuItemLabel(item: MenuItem): string {
  if (item === 'setupdrink') return 'Summary'
  const found = MENU_ITEMS.find((menuItem) => menuItem.id === item)
  return found?.label ?? 'Menu'
}

function getDetailTitle(item: MenuItem): string {
  if (item === 'standBy') return ''
  if (item === 'presets') return 'Load preset'
  return getMenuItemLabel(item)
}

function getScreenBody(item: MenuItem): string {
  switch (item) {
    case 'standBy':
      return ''
    case 'adddrink':
      return `Add drink\nVolume: ${state.drinkMl} ml\nStrength: ${state.drinkPercent}%`
    case 'setupdrink': {
      const settings = state.bacSettings

      return [
        `Metabolism: ${METABOLISM_LEVEL_LABELS[settings.metabolismLevel]}`,
        `Food: ${settings.foodProfile}`,
        `Weight: ${settings.weightKg} kg`,
        `Height: ${Math.round(settings.heightCm)} cm`,
        `Sex: ${settings.sexAtBirth}`,
        `Age: ${Math.round(settings.ageYears)}`,
      ].join('\n')
    }
    case 'presets':
      return state.drinkPresets.length > 0
        ? 'Tap a preset to load it'
        : 'No presets saved'
  }
}

export async function initMenu(): Promise<void> {
  await runSerializedRender(async () => {
    const ok = await showMainMenuListLayout()
    if (ok) {
      currentLayoutMode = 'main-menu'
    }
  })
}

export async function updateTopRightCountdownOnly(): Promise<void> {
  await runSerializedRender(updateTopRightCountdownOnlyInternal)
}

export async function updateRightDynamicContentOnly(): Promise<void> {
  await runSerializedRender(updateRightDynamicContentOnlyInternal)
}

export async function updateMenuDisplay(): Promise<void> {
  await runSerializedRender(updateMenuDisplayInternal)
}

export async function showContent(): Promise<void> {
  await updateMenuDisplay()
}

export async function updateDisplay(): Promise<void> {
  await showContent()
}

export function resetRendererSession(): void {
  containersCreated = false
  currentLayoutMode = null
  resetBridgeSerializer()
  standbyHudHidden = false
  consecutiveRenderFailures = 0
}
