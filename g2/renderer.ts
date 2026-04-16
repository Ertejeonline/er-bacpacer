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

  // Center the menu at 80% size
  const menuWidth = Math.round(W * 0.8)  // 461
  const menuHeight = Math.round(H * 0.8) // 230
  const menuX = Math.round((W - menuWidth) / 2)  // 58
  const menuY = Math.round((H - menuHeight) / 2) // 29

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'menu',
        xPosition: menuX,
        yPosition: menuY,
        width: menuWidth,
        height: menuHeight,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: MENU_ITEMS.length,
          itemWidth: menuWidth - 10,
          isItemSelectBorderEn: 1,
          itemName: MENU_ITEMS,
        }),
      }),
    ],
  })
}

// --- Run my app ---

export async function showRunMyApp(): Promise<void> {
  state.screen = 'run-my-app'

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'run-my-app',
        content: 'Hi GT',
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        isEventCapture: 1,
        paddingLength: 8,
      }),
    ],
  })
}

// --- Text: basic ---

export async function showTextBasic(): Promise<void> {
  state.screen = 'text-basic'

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

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'text',
        content,
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        isEventCapture: 1,
        paddingLength: 8,
      }),
    ],
  })
}

// --- Text: borders & padding ---

export async function showTextBorders(): Promise<void> {
  state.screen = 'text-borders'

  await rebuildPage({
    containerTotalNum: 4,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'b0',
        content: 'No border\npadding=0',
        xPosition: 0,
        yPosition: 0,
        width: W / 2,
        height: H / 2,
        isEventCapture: 1,
        paddingLength: 0,
        borderWidth: 0,
      }),
      new TextContainerProperty({
        containerID: 2,
        containerName: 'b1',
        content: 'border=1 color=5\nradius=4 pad=8',
        xPosition: W / 2,
        yPosition: 0,
        width: W / 2,
        height: H / 2,
        isEventCapture: 0,
        paddingLength: 8,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'b2',
        content: 'border=3 color=10\nradius=8 pad=16',
        xPosition: 0,
        yPosition: H / 2,
        width: W / 2,
        height: H / 2,
        isEventCapture: 0,
        paddingLength: 16,
        borderWidth: 3,
        borderColor: 10,
        borderRadius: 8,
      }),
      new TextContainerProperty({
        containerID: 4,
        containerName: 'b3',
        content: 'border=5 color=15\nradius=10 pad=32',
        xPosition: W / 2,
        yPosition: H / 2,
        width: W / 2,
        height: H / 2,
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

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'unicode',
        content,
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        isEventCapture: 1,
        paddingLength: 8,
      }),
    ],
  })
}

export async function nextUnicodePage(): Promise<void> {
  state.unicodePage = (state.unicodePage + 1) % UNICODE_PAGES.length
  await renderUnicodePage()
}

// --- List: basic ---

export async function showListBasic(): Promise<void> {
  state.screen = 'list-basic'

  const items = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}`)

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'list',
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: items.length,
          itemWidth: W - 10,
          isItemSelectBorderEn: 1,
          itemName: items,
        }),
      }),
    ],
  })
}

// --- List: styled ---

export async function showListStyled(): Promise<void> {
  state.screen = 'list-styled'

  const items = [
    '\u25CF Climate ON',
    '\u25CB Sentry OFF',
    '\u2605 Favourites',
    '\u2714 Confirmed',
    '\u2718 Cancelled',
    '\u203A More options',
  ]

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'styled',
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        borderWidth: 2,
        borderColor: 10,
        borderRadius: 6,
        paddingLength: 8,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: items.length,
          itemWidth: W - 20,
          isItemSelectBorderEn: 1,
          itemName: items,
        }),
      }),
    ],
  })
}

// --- Image: fullscreen tiled (2x2 grid) ---

export async function showImageFullscreen(): Promise<void> {
  state.screen = 'image-fullscreen'

  const tileW = 288
  const tileH = 144

  await rebuildPage({
    containerTotalNum: 5,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'evt',
        content: ' ',
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        isEventCapture: 1,
        paddingLength: 0,
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 2,
        containerName: 'tl',
        xPosition: 0,
        yPosition: 0,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 3,
        containerName: 'tr',
        xPosition: tileW,
        yPosition: 0,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'bl',
        xPosition: 0,
        yPosition: tileH,
        width: tileW,
        height: tileH,
      }),
      new ImageContainerProperty({
        containerID: 5,
        containerName: 'br',
        xPosition: tileW,
        yPosition: tileH,
        width: tileW,
        height: tileH,
      }),
    ],
  })

  const patterns: Pattern[] = ['gradient-h', 'gradient-v', 'checkerboard', 'crosshatch']
  const names = ['tl', 'tr', 'bl', 'br']

  for (let i = 0; i < 4; i++) {
    const canvas = generatePattern(tileW, tileH, patterns[i], `${patterns[i]} ${tileW}x${tileH}`)
    await pushImage(i + 2, names[i], await canvasToPng(canvas))
  }
}

// --- Max containers (4 image + 8 other = 12 total) ---

export async function showMaxContainers(): Promise<void> {
  state.screen = 'max-containers'

  // Layout: top row of 4 text labels, middle row of 4 images, bottom has 3 text + 1 list
  const imgW = 144
  const imgH = 96
  const rowH = 96
  const topH = 96
  const bottomH = H - topH - rowH

  const textContainers: TextContainerProperty[] = []
  const imageContainers: ImageContainerProperty[] = []

  // Row 1: 4 text containers across top (IDs 1-4)
  for (let i = 0; i < 4; i++) {
    textContainers.push(new TextContainerProperty({
      containerID: i + 1,
      containerName: `t${i}`,
      content: `Text ${i + 1}\nborder=${i} color=${i * 5}`,
      xPosition: i * (W / 4),
      yPosition: 0,
      width: W / 4,
      height: topH,
      isEventCapture: i === 0 ? 1 : 0,
      paddingLength: 4,
      borderWidth: i,
      borderColor: i * 5,
      borderRadius: i * 2,
    }))
  }

  // Row 2: 4 image containers (IDs 5-8)
  for (let i = 0; i < 4; i++) {
    imageContainers.push(new ImageContainerProperty({
      containerID: i + 5,
      containerName: `i${i}`,
      xPosition: i * imgW,
      yPosition: topH,
      width: imgW,
      height: imgH,
    }))
  }

  // Row 3: 3 more text containers (IDs 9-11) + 1 list (ID 12)
  const bottomColW = W / 4
  for (let i = 0; i < 3; i++) {
    textContainers.push(new TextContainerProperty({
      containerID: i + 9,
      containerName: `b${i}`,
      content: `Bottom ${i + 1}`,
      xPosition: i * bottomColW,
      yPosition: topH + rowH,
      width: bottomColW,
      height: bottomH,
      isEventCapture: 0,
      paddingLength: 4,
      borderWidth: 1,
      borderColor: 8,
    }))
  }

  const listContainer = new ListContainerProperty({
    containerID: 12,
    containerName: 'lst',
    xPosition: 3 * bottomColW,
    yPosition: topH + rowH,
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
    containerTotalNum: 12,
    textObject: textContainers,
    listObject: [listContainer],
    imageObject: imageContainers,
  })

  // Push distinct patterns to each image container
  const patterns: Pattern[] = ['dots', 'stripes-h', 'stripes-v', 'diagonal']
  for (let i = 0; i < 4; i++) {
    const canvas = generatePattern(imgW, imgH, patterns[i], patterns[i])
    await pushImage(i + 5, `i${i}`, await canvasToPng(canvas))
  }
}

// --- Events inspector ---

export async function showEvents(): Promise<void> {
  state.screen = 'events'
  state.eventCount = 0
  state.lastEvent = 'none'

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'events',
        content: eventsContent(),
        xPosition: 0,
        yPosition: 0,
        width: W,
        height: H,
        isEventCapture: 1,
        paddingLength: 8,
      }),
    ],
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
      containerID: 1,
      containerName: 'events',
      content: eventsContent(),
    }),
  )
}
