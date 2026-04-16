import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { state, getBridge } from './state'

const W = 576
const H = 288

// --- Time display ---

function getCurrentTime(): string {
  const now = new Date()
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })
}

export async function updateTimeDisplay(): Promise<void> {
  const b = getBridge()
  if (!b) return

  await b.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'document',
      content: getCurrentTime(),
    }),
  )
}

// --- Rebuild helper ---

async function rebuildPage(config: {
  containerTotalNum: number
  textObject?: TextContainerProperty[]
  listObject?: ListContainerProperty[]
  imageObject?: ImageContainerProperty[]
}): Promise<void> {
  const b = getBridge()
  if (!b) return

  if (!state.startupRendered) {
    await b.createStartUpPageContainer(new CreateStartUpPageContainer(config))
    state.startupRendered = true
    return
  }

  await b.rebuildPageContainer(new RebuildPageContainer(config))
}

// --- Image generation ---

type Pattern = 'gradient-h' | 'gradient-v' | 'checkerboard' | 'crosshatch' | 'dots' | 'stripes-h' | 'stripes-v' | 'diagonal'

function generatePattern(
  width: number,
  height: number,
  pattern: Pattern,
  label?: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)

  switch (pattern) {
    case 'gradient-h':
      for (let x = 0; x < width; x++) {
        const v = Math.round((x / width) * 255)
        ctx.fillStyle = `rgb(${v},${v},${v})`
        ctx.fillRect(x, 0, 1, height)
      }
      break
    case 'gradient-v':
      for (let y = 0; y < height; y++) {
        const v = Math.round((y / height) * 255)
        ctx.fillStyle = `rgb(${v},${v},${v})`
        ctx.fillRect(0, y, width, 1)
      }
      break
    case 'checkerboard': {
      const size = 24
      for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size) {
          if (((x / size) + (y / size)) % 2 === 0) {
            ctx.fillStyle = 'white'
            ctx.fillRect(x, y, size, size)
          }
        }
      }
      break
    }
    case 'crosshatch':
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1
      for (let i = 0; i < Math.max(width, height) * 2; i += 16) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i - height, height)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(i - height, 0)
        ctx.lineTo(i, height)
        ctx.stroke()
      }
      break
    case 'dots':
      ctx.fillStyle = 'white'
      for (let y = 8; y < height; y += 16) {
        for (let x = 8; x < width; x += 16) {
          ctx.beginPath()
          ctx.arc(x, y, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    case 'stripes-h':
      ctx.fillStyle = 'white'
      for (let y = 0; y < height; y += 12) {
        ctx.fillRect(0, y, width, 6)
      }
      break
    case 'stripes-v':
      ctx.fillStyle = 'white'
      for (let x = 0; x < width; x += 12) {
        ctx.fillRect(x, 0, 6, height)
      }
      break
    case 'diagonal':
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      for (let i = -height; i < width + height; i += 12) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + height, height)
        ctx.stroke()
      }
      break
  }

  if (label) {
    // Draw label background for readability
    ctx.fillStyle = 'black'
    ctx.fillRect(4, 4, label.length * 9, 20)
    ctx.fillStyle = 'white'
    ctx.font = '14px monospace'
    ctx.fillText(label, 8, 20)
  }

  return canvas
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<number[]> {
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve!, 'image/png'))
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

async function pushImage(id: number, name: string, data: number[]): Promise<void> {
  const b = getBridge()
  if (!b) return
  const result = await b.updateImageRawData(new ImageRawDataUpdate({
    containerID: id,
    containerName: name,
    imageData: data,
  }))
  appendEventLog(`Image[${name}]: ${String(result)}`)
}

// =====================
// DEMO SCREENS
// =====================

// --- Main menu ---

const MENU_ITEMS = [
  'Run my app',
  'Text: basic',
  'Text: borders & padding',
  'Text: Unicode & symbols',
  'List: basic',
  'List: styled',
  'Image: fullscreen tiled',
  'Max containers (4 img + 8 other)',
  'Events inspector',
]

export async function showMenu(): Promise<void> {
  state.screen = 'menu'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const menuContainer = new ListContainerProperty({
    containerID: 2,
    containerName: 'main',
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    borderWidth: 1,
    borderColor: 5,
    borderRadius: 4,
    paddingLength: 4,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: MENU_ITEMS.length,
      itemWidth: mainWidth - 10,
      isItemSelectBorderEn: 1,
      itemName: MENU_ITEMS,
    }),
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer],
    listObject: [menuContainer],
  })
}

// --- Run my app ---

export async function showRunMyApp(): Promise<void> {
  state.screen = 'run-my-app'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const runMyAppContainer = new TextContainerProperty({
    containerID: 2,
    containerName: 'main',
    content: 'Hi GT',
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    isEventCapture: 1,
    paddingLength: 8,
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer, runMyAppContainer],
  })
}

// --- Text: basic ---

export async function showTextBasic(): Promise<void> {
  state.screen = 'text-basic'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const content = [
    'Text container demo',
    '',
    'Plain text, left-aligned, top-aligned.',
    'Text wraps at container width.',
    'Supports \\n for line breaks.',
    '',
    'No font size, weight, or alignment',
    'control. Single font, greyscale.',
    '',
    'Max 1000 chars on rebuild,',
    '2000 chars on textContainerUpgrade.',
    '',
    'Double-tap to go back.',
  ].join('\n')

  const textContainer = new TextContainerProperty({
    containerID: 2,
    containerName: 'main',
    content,
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    isEventCapture: 1,
    paddingLength: 8,
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer, textContainer],
  })
}

// --- Text: borders & padding ---

export async function showTextBorders(): Promise<void> {
  state.screen = 'text-borders'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container dimensions (80% centered)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  // Create 4 containers within the main area
  const quadWidth = Math.round(mainWidth / 2)  // 231
  const quadHeight = Math.round(mainHeight / 2) // 115

  await rebuildPage({
    containerTotalNum: 5,
    textObject: [
      documentContainer,
      new TextContainerProperty({
        containerID: 2,
        containerName: 'b0',
        content: 'No border\npadding=0',
        xPosition: mainX,
        yPosition: mainY,
        width: quadWidth,
        height: quadHeight,
        isEventCapture: 1,
        paddingLength: 0,
        borderWidth: 0,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'b1',
        content: 'border=1 color=5\nradius=4 pad=8',
        xPosition: mainX + quadWidth,
        yPosition: mainY,
        width: quadWidth,
        height: quadHeight,
        isEventCapture: 0,
        paddingLength: 8,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'b2',
        content: 'border=3 color=10\nradius=8 pad=16',
        xPosition: mainX,
        yPosition: mainY + quadHeight,
        width: quadWidth,
        height: quadHeight,
        isEventCapture: 0,
        paddingLength: 16,
        borderWidth: 3,
        borderColor: 10,
        borderRadius: 8,
      }),
      new TextContainerProperty({
        containerID: 5,
        containerName: 'b3',
        content: 'border=5 color=15\nradius=10 pad=32',
        xPosition: mainX + quadWidth,
        yPosition: mainY + quadHeight,
        width: quadWidth,
        height: quadHeight,
        isEventCapture: 0,
        paddingLength: 32,
        borderWidth: 5,
        borderColor: 15,
        borderRadius: 10,
      }),
    ],
  })
}

// --- Text: Unicode & symbols ---

export async function showTextUnicode(): Promise<void> {
  state.screen = 'text-unicode'
  state.unicodePage = 0
  await renderUnicodePage()
}

const UNICODE_PAGES = [
  // Page 1: Arrows, box drawing, blocks
  [
    'GLYPHS 1/3 (tap=next, dbl=back)',
    '',
    'Arrows:',
    '\u2190 \u2191 \u2192 \u2193 \u2194 \u2195 \u2196 \u2197 \u2198 \u2199 \u21D2 \u21D4',
    '',
    'Box drawing:',
    '\u250C\u2500\u252C\u2500\u2510 \u250F\u2501\u2533\u2501\u2513',
    '\u2502 \u2502 \u2502 \u2503 \u2503 \u2503',
    '\u251C\u2500\u253C\u2500\u2524 \u2523\u2501\u254B\u2501\u252B',
    '\u2514\u2500\u2534\u2500\u2518 \u2517\u2501\u253B\u2501\u251B',
    'Rounded: \u256D\u2500\u256E \u2571\u2572\u2573',
    '         \u2570\u2500\u256F',
    '',
    'Block elements:',
    'Lower: \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588',
    'Left:  \u258F\u258E\u258D\u258C\u258B\u258A\u2589\u2588',
    'Shade: \u2592 Upper: \u2594 Right: \u2595',
  ].join('\n'),

  // Page 2: Progress bars, shapes, symbols
  [
    'GLYPHS 2/3 (tap=next, dbl=back)',
    '',
    'Progress bars:',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2500\u2500\u2500 70%',
    '\u2588\u2588\u2588\u2588\u2588\u2588\u2592\u2592\u2592\u2592 60%',
    '\u2589\u258A\u258B\u258C\u258D\u258E\u258F fractional',
    '',
    'Geometric shapes:',
    '\u25A0 \u25A1 \u25A3 \u25A4 \u25A5 \u25A6 \u25A7 \u25A8 \u25A9',
    '\u25B2 \u25B3 \u25B6 \u25B7 \u25BC \u25BD \u25C0 \u25C1',
    '\u25C6 \u25C7 \u25C8 \u25CA \u25CB \u25CC \u25CE \u25CF',
    '\u25D0 \u25D1 \u25E2 \u25E3 \u25E4 \u25E5 \u25EF',
    '',
    'Misc symbols:',
    '\u2605 \u2606 \u2609 \u260E \u260F \u261C \u261E',
    'Cards: \u2660 \u2661 \u2663 \u2664 \u2665 \u2667',
  ].join('\n'),

  // Page 3: Typographic, super/subscripts, fractions
  [
    'GLYPHS 3/3 (tap=next, dbl=back)',
    '',
    'Typographic:',
    '\u00A9 \u00AE \u2122 \u2020 \u203B \u00B0 \u221E',
    '',
    'Superscripts:',
    '\u2070 \u00B9 \u00B2 \u00B3 \u2074 \u2075 \u2076 \u2077 \u2078 \u2079',
    '',
    'Subscripts:',
    '\u2080 \u2081 \u2082 \u2083 \u2084 \u2085 \u2086 \u2087 \u2088 \u2089',
    '',
    'Fractions:',
    '\u00BC \u00BD \u215B',
    '',
    'Latin-1 sample:',
    '\u00A1\u00A2\u00A3\u00A4\u00A5\u00A7\u00AB\u00AC\u00AE\u00B1\u00B6\u00BB',
    '\u00C0\u00C9\u00D1\u00D6\u00DC\u00DF\u00E0\u00E9\u00F1\u00F6\u00FC\u00FF',
  ].join('\n'),
]

async function renderUnicodePage(): Promise<void> {
  const content = UNICODE_PAGES[state.unicodePage]

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const unicodeContainer = new TextContainerProperty({
    containerID: 2,
    containerName: 'main',
    content,
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    isEventCapture: 1,
    paddingLength: 8,
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer, unicodeContainer],
  })
}

export async function nextUnicodePage(): Promise<void> {
  state.unicodePage = (state.unicodePage + 1) % UNICODE_PAGES.length
  await renderUnicodePage()
}

// --- List: basic ---

export async function showListBasic(): Promise<void> {
  state.screen = 'list-basic'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const items = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}`)

  const listContainer = new ListContainerProperty({
    containerID: 2,
    containerName: 'main',
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    paddingLength: 4,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: mainWidth - 10,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer],
    listObject: [listContainer],
  })
}

// --- List: styled ---

export async function showListStyled(): Promise<void> {
  state.screen = 'list-styled'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const items = [
    '\u25CF Climate ON',
    '\u25CB Sentry OFF',
    '\u2605 Favourites',
    '\u2714 Confirmed',
    '\u2718 Cancelled',
    '\u203A More options',
  ]

  const listContainer = new ListContainerProperty({
    containerID: 2,
    containerName: 'main',
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    borderWidth: 2,
    borderColor: 10,
    borderRadius: 6,
    paddingLength: 8,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: mainWidth - 20,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer],
    listObject: [listContainer],
  })
}

// --- Image: fullscreen tiled (2x2 grid) ---

export async function showImageFullscreen(): Promise<void> {
  state.screen = 'image-fullscreen'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const tileW = Math.round(mainWidth / 2)  // 231
  const tileH = Math.round(mainHeight / 2) // 115

  await rebuildPage({
    containerTotalNum: 6,
    textObject: [
      documentContainer,
      new TextContainerProperty({
        containerID: 2,
        containerName: 'main',
        content: ' ',
        xPosition: mainX,
        yPosition: mainY,
        width: mainWidth,
        height: mainHeight,
        isEventCapture: 1,
        paddingLength: 0,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 3,
        containerName: 'tl',
        xPosition: mainX,
        yPosition: mainY,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'tr',
        xPosition: mainX + tileW,
        yPosition: mainY,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 5,
        containerName: 'bl',
        xPosition: mainX,
        yPosition: mainY + tileH,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 6,
        containerName: 'br',
        xPosition: mainX + tileW,
        yPosition: mainY + tileH,
        width: tileW,
        height: tileH,
      }),
    ],
  })

  const patterns: Pattern[] = ['gradient-h', 'gradient-v', 'checkerboard', 'crosshatch']
  const names = ['tl', 'tr', 'bl', 'br']

  for (let i = 0; i < 4; i++) {
    const canvas = generatePattern(tileW, tileH, patterns[i], `${patterns[i]} ${tileW}x${tileH}`)
    await pushImage(i + 3, names[i], await canvasToPng(canvas))
  }
}

// --- Max containers (4 image + 8 other = 12 total) ---

export async function showMaxContainers(): Promise<void> {
  state.screen = 'max-containers'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  // Scale factor for fitting content into main container
  const scaleX = mainWidth / W
  const scaleY = mainHeight / H

  // Layout: top row of 4 text labels, middle row of 4 images, bottom has 3 text + 1 list
  const imgW = Math.round(144 * scaleX)  // scaled image width
  const imgH = Math.round(96 * scaleY)   // scaled image height
  const rowH = Math.round(96 * scaleY)   // scaled row height
  const topH = Math.round(96 * scaleY)   // scaled top height
  const bottomH = mainHeight - topH - rowH  // remaining height for bottom row

  const textContainers: TextContainerProperty[] = []
  const imageContainers: ImageContainerProperty[] = []

  // Row 1: 4 text containers across top (IDs 2-5)
  for (let i = 0; i < 4; i++) {
    textContainers.push(new TextContainerProperty({
      containerID: i + 2,
      containerName: `t${i}`,
      content: `Text ${i + 1}\nborder=${i} color=${i * 5}`,
      xPosition: mainX + Math.round(i * (mainWidth / 4)),
      yPosition: mainY,
      width: Math.round(mainWidth / 4),
      height: topH,
      isEventCapture: i === 0 ? 1 : 0,
      paddingLength: 4,
      borderWidth: i,
      borderColor: i * 5,
      borderRadius: i * 2,
    }))
  }

  // Row 2: 4 image containers (IDs 6-9)
  for (let i = 0; i < 4; i++) {
    imageContainers.push(new ImageContainerProperty({
      containerID: i + 6,
      containerName: `i${i}`,
      xPosition: mainX + Math.round(i * imgW),
      yPosition: mainY + topH,
      width: imgW,
      height: imgH,
    }))
  }

  // Row 3: 3 more text containers (IDs 10-12) + 1 list (ID 13)
  const bottomColW = Math.round(mainWidth / 4)
  for (let i = 0; i < 3; i++) {
    textContainers.push(new TextContainerProperty({
      containerID: i + 10,
      containerName: `b${i}`,
      content: `Bottom ${i + 1}`,
      xPosition: mainX + Math.round(i * bottomColW),
      yPosition: mainY + topH + rowH,
      width: bottomColW,
      height: bottomH,
      isEventCapture: 0,
      paddingLength: 4,
      borderWidth: 1,
      borderColor: 8,
    }))
  }

  const listContainer = new ListContainerProperty({
    containerID: 13,
    containerName: 'lst',
    xPosition: mainX + Math.round(3 * bottomColW),
    yPosition: mainY + topH + rowH,
    width: bottomColW,
    height: bottomH,
    paddingLength: 2,
    isEventCapture: 0,
    itemContainer: new ListItemContainerProperty({
      itemCount: 3,
      itemWidth: bottomColW - 6,
      isItemSelectBorderEn: 1,
      itemName: ['A', 'B', 'C'],
    }),
  })

  await rebuildPage({
    containerTotalNum: 13,
    textObject: [documentContainer, ...textContainers],
    listObject: [listContainer],
    imageObject: imageContainers,
  })

  // Push distinct patterns to each image container
  const patterns: Pattern[] = ['dots', 'stripes-h', 'stripes-v', 'diagonal']
  for (let i = 0; i < 4; i++) {
    const canvas = generatePattern(imgW, imgH, patterns[i], patterns[i])
    await pushImage(i + 6, `i${i}`, await canvasToPng(canvas))
  }
}

// --- Events inspector ---

export async function showEvents(): Promise<void> {
  state.screen = 'events'
  state.eventCount = 0
  state.lastEvent = 'none'

  // Document container (small time display at top-left)
  const documentContainer = new TextContainerProperty({
    containerID: 1,
    containerName: 'document',
    content: getCurrentTime(),
    xPosition: 0,
    yPosition: 0,
    width: Math.round(W * 0.2),  // 80% smaller = 20% of screen width
    height: Math.round(H * 0.2), // 80% smaller = 20% of screen height
    isEventCapture: 0,
    paddingLength: 2,
    borderWidth: 0,
  })

  // Main container (80% centered, contains the actual content)
  const mainWidth = Math.round(W * 0.8)  // 461
  const mainHeight = Math.round(H * 0.8) // 230
  const mainX = Math.round((W - mainWidth) / 2)  // 58
  const mainY = Math.round((H - mainHeight) / 2) // 29

  const eventsContainer = new TextContainerProperty({
    containerID: 2,
    containerName: 'main',
    content: eventsContent(),
    xPosition: mainX,
    yPosition: mainY,
    width: mainWidth,
    height: mainHeight,
    isEventCapture: 1,
    paddingLength: 8,
  })

  await rebuildPage({
    containerTotalNum: 2,
    textObject: [documentContainer, eventsContainer],
  })
}

function eventsContent(): string {
  return [
    'Events inspector',
    '',
    `Event count: ${state.eventCount}`,
    `Last event: ${state.lastEvent}`,
    '',
    'Tap, double-tap, or scroll to see',
    'events logged here in real time.',
    '',
    'Events: CLICK=0, SCROLL_TOP=1,',
    'SCROLL_BOTTOM=2, DOUBLE_CLICK=3',
    '',
    'Double-tap to go back to menu.',
  ].join('\n')
}

export async function updateEventsDisplay(): Promise<void> {
  const b = getBridge()
  if (!b) return

  await b.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 2,
      containerName: 'main',
      content: eventsContent(),
    }),
  )
}
