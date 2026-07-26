import type { AppModule } from '../_shared/app-types'
import { METABOLISM_LEVEL_LABELS } from '../_shared/app-types'

function updateStatus(text: string) {
  console.log(`[ui] ${text}`)
  const el = document.getElementById('status')
  if (el) el.textContent = text
}

async function boot() {
  const module = await import('../g2/index')
  const app: AppModule = module.app ?? module.default

  const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement | null
  const confirmResetModal = document.getElementById('confirmResetModal')
  const confirmResetBtn = document.getElementById('confirmResetBtn') as HTMLButtonElement | null
  const cancelResetBtn = document.getElementById('cancelResetBtn') as HTMLButtonElement | null
  const drinksLogBtn = document.getElementById('drinksLogBtn') as HTMLButtonElement | null
  const bacSettingsBtn = document.getElementById('bacSettingsBtn') as HTMLButtonElement | null
  const presetsBtn = document.getElementById('presetsBtn') as HTMLButtonElement | null
  const drinksLogModal = document.getElementById('drinksLogModal')
  const drinksLogList = document.getElementById('drinksLogList')
  const closeDrinksLogBtn = document.getElementById('closeDrinksLogBtn') as HTMLButtonElement | null
  const confirmDeleteDrinkModal = document.getElementById('confirmDeleteDrinkModal')
  const confirmDeleteDrinkText = document.getElementById('confirmDeleteDrinkText')
  const confirmDeleteDrinkBtn = document.getElementById('confirmDeleteDrinkBtn') as HTMLButtonElement | null
  const cancelDeleteDrinkBtn = document.getElementById('cancelDeleteDrinkBtn') as HTMLButtonElement | null
  const editDrinkModal = document.getElementById('editDrinkModal')
  const editDrinkTimeInput = document.getElementById('editDrinkTimeInput') as HTMLInputElement | null
  const editDrinkEndTimeInput = document.getElementById('editDrinkEndTimeInput') as HTMLInputElement | null
  const editDrinkMlInput = document.getElementById('editDrinkMlInput') as HTMLInputElement | null
  const editDrinkPercentInput = document.getElementById('editDrinkPercentInput') as HTMLInputElement | null
  const saveEditDrinkBtn = document.getElementById('saveEditDrinkBtn') as HTMLButtonElement | null
  const cancelEditDrinkBtn = document.getElementById('cancelEditDrinkBtn') as HTMLButtonElement | null
  const bacSettingsModal = document.getElementById('bacSettingsModal')
  const bacEstimatePreview = document.getElementById('bacEstimatePreview')
  const bacSoberAtPreview = document.getElementById('bacSoberAtPreview')
  const bacMetabolismLevelInput = document.getElementById('bacMetabolismLevelInput') as HTMLInputElement | null
  const bacMetabolismLevelLabel = document.getElementById('bacMetabolismLevelLabel') as HTMLSpanElement | null
  const bacWeightKgInput = document.getElementById('bacWeightKgInput') as HTMLInputElement | null
  const bacSexAtBirthInput = document.getElementById('bacSexAtBirthInput') as HTMLSelectElement | null
  const bacDateOfBirthInput = document.getElementById('bacDateOfBirthInput') as HTMLInputElement | null
  const bacHeightCmInput = document.getElementById('bacHeightCmInput') as HTMLInputElement | null
  const bacFoodProfileInput = document.getElementById('bacFoodProfileInput') as HTMLSelectElement | null
  const saveBacSettingsBtn = document.getElementById('saveBacSettingsBtn') as HTMLButtonElement | null
  const cancelBacSettingsBtn = document.getElementById('cancelBacSettingsBtn') as HTMLButtonElement | null
  const presetsModal = document.getElementById('presetsModal')
  const presetsList = document.getElementById('presetsList')
  const addPresetBtn = document.getElementById('addPresetBtn') as HTMLButtonElement | null
  const closePresetsBtn = document.getElementById('closePresetsBtn') as HTMLButtonElement | null
  const presetEditor = document.getElementById('presetEditor')
  const presetEditorTitle = document.getElementById('presetEditorTitle')
  const presetMlInput = document.getElementById('presetMlInput') as HTMLInputElement | null
  const presetPercentInput = document.getElementById('presetPercentInput') as HTMLInputElement | null
  const savePresetBtn = document.getElementById('savePresetBtn') as HTMLButtonElement | null
  const cancelPresetBtn = document.getElementById('cancelPresetBtn') as HTMLButtonElement | null

  document.title = `${app.name} – Even G2`
  updateStatus(app.initialStatus ?? `${app.name} app ready`)

  if (resetBtn && app.resetLabel) {
    const label = resetBtn.querySelector('.btn-label')
    if (label) {
      label.textContent = app.resetLabel
    } else {
      resetBtn.textContent = app.resetLabel
    }
  }

  const actions = await app.createActions(updateStatus)
  let pendingDeleteTimestampMs: number | null = null
  let editingDrinkTimestampMs: number | null = null
  let editingPresetId: string | null = null

  const formatTimeInputValue = (timestampMs: number) => {
    const date = new Date(timestampMs)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const estimateDrinkDurationMs = (ml: number, percent: number) => {
    const fraction = percent >= 1 ? percent / 100 : percent
    return Math.max(0, ((ml * fraction) / 0.5) * 60_000)
  }

  const deriveDateOfBirthFromAgeYears = (ageYears: number): string => {
    const now = new Date()
    const year = now.getFullYear() - Math.max(0, Math.floor(ageYears))
    return `${String(year).padStart(4, '0')}-01-01`
  }

  const normalizeDateOfBirth = (value: string): string | null => {
    const raw = value.trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (!match) return null

    const yyyy = Number(match[1])
    const mm = Number(match[2])
    const dd = Number(match[3])
    const date = new Date(Date.UTC(yyyy, mm - 1, dd))

    if (
      !Number.isFinite(yyyy)
      || mm < 1
      || mm > 12
      || dd < 1
      || dd > 31
      || date.getUTCFullYear() !== yyyy
      || (date.getUTCMonth() + 1) !== mm
      || date.getUTCDate() !== dd
    ) {
      return null
    }

    return raw
  }

  const normalizeLooseTimeToHHMM = (value: string): string | null => {
    const raw = value.trim()
    if (!raw) return null

    const toFormattedTime = (hours: number, minutes: number) => {
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    const directMatch = /^(\d{1,2}):(\d{1,2})$/.exec(raw)
    if (directMatch) {
      return toFormattedTime(Number(directMatch[1]), Number(directMatch[2]))
    }

    const hourOnlyMatch = /^(\d{1,2})$/.exec(raw)
    if (hourOnlyMatch) {
      return toFormattedTime(Number(hourOnlyMatch[1]), 0)
    }

    const hourWithColonMatch = /^(\d{1,2}):$/.exec(raw)
    if (hourWithColonMatch) {
      return toFormattedTime(Number(hourWithColonMatch[1]), 0)
    }

    const minuteOnlyWithColonMatch = /^:(\d{1,2})$/.exec(raw)
    if (minuteOnlyWithColonMatch) {
      return toFormattedTime(0, Number(minuteOnlyWithColonMatch[1]))
    }

    const compactDigitsMatch = /^(\d{3,4})$/.exec(raw)
    if (compactDigitsMatch) {
      const digits = compactDigitsMatch[1]
      const hoursPart = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2)
      const minutesPart = digits.slice(-2)
      return toFormattedTime(Number(hoursPart), Number(minutesPart))
    }

    return null
  }

  const normalizeTimeInputInPlace = (input: HTMLInputElement | null): boolean => {
    if (!input) return false
    const normalized = normalizeLooseTimeToHHMM(input.value)
    if (!normalized) return false
    input.value = normalized
    return true
  }

  const closeEditDrinkModal = () => {
    editingDrinkTimestampMs = null
    editDrinkModal?.classList.add('hidden')
  }

  const openEditDrinkModal = (timestampMs: number) => {
    if (!editDrinkModal || !actions.getDrinkEntries || !editDrinkTimeInput || !editDrinkEndTimeInput || !editDrinkMlInput || !editDrinkPercentInput) return

    const entry = actions.getDrinkEntries().find((candidate) => candidate.timestampMs === timestampMs)
    if (!entry) return

    const endTimestampMs = typeof entry.endTimestampMs === 'number'
      ? Math.max(entry.timestampMs, entry.endTimestampMs)
      : (entry.timestampMs + estimateDrinkDurationMs(entry.ml, entry.percent))

    editingDrinkTimestampMs = entry.timestampMs
    editDrinkTimeInput.value = formatTimeInputValue(entry.timestampMs)
    editDrinkEndTimeInput.value = formatTimeInputValue(endTimestampMs)
    editDrinkMlInput.value = String(entry.ml)
    editDrinkPercentInput.value = entry.percent.toFixed(1)
    editDrinkModal.classList.remove('hidden')
  }

  const closeDeleteDrinkModal = () => {
    pendingDeleteTimestampMs = null
    confirmDeleteDrinkModal?.classList.add('hidden')
  }

  const closeBacSettingsModal = () => {
    bacSettingsModal?.classList.add('hidden')
  }

  const closePresetEditor = () => {
    editingPresetId = null
    presetEditor?.classList.add('hidden')
    if (presetMlInput) presetMlInput.value = ''
    if (presetPercentInput) presetPercentInput.value = ''
    if (presetEditorTitle) presetEditorTitle.textContent = 'Add preset'
  }

  const openPresetEditor = (presetId?: string) => {
    if (!actions.getDrinkPresets || !presetEditor || !presetMlInput || !presetPercentInput) return

    if (presetId) {
      const preset = actions.getDrinkPresets().find((candidate) => candidate.id === presetId)
      if (!preset) return

      editingPresetId = preset.id
      presetMlInput.value = String(preset.ml)
      presetPercentInput.value = preset.percent.toFixed(1)
      if (presetEditorTitle) presetEditorTitle.textContent = 'Edit preset'
    } else {
      editingPresetId = null
      presetMlInput.value = ''
      presetPercentInput.value = ''
      if (presetEditorTitle) presetEditorTitle.textContent = 'Add preset'
    }

    presetEditor.classList.remove('hidden')
  }

  const closePresetsModal = () => {
    closePresetEditor()
    presetsModal?.classList.add('hidden')
  }

  const openBacSettingsModal = () => {
    if (
      !actions.getBacSettings
      || !bacSettingsModal
      || !bacMetabolismLevelInput
      || !bacWeightKgInput
      || !bacSexAtBirthInput
      || !bacDateOfBirthInput
      || !bacHeightCmInput
      || !bacFoodProfileInput
    ) {
      return
    }

    const settings = actions.getBacSettings()
    bacMetabolismLevelInput.value = String(settings.metabolismLevel)
    if (bacMetabolismLevelLabel) {
      bacMetabolismLevelLabel.textContent = METABOLISM_LEVEL_LABELS[settings.metabolismLevel]
    }
    bacWeightKgInput.value = String(settings.weightKg)
    bacSexAtBirthInput.value = settings.sexAtBirth
    bacDateOfBirthInput.value = settings.dateOfBirth ?? deriveDateOfBirthFromAgeYears(settings.ageYears)
    bacHeightCmInput.value = String(Math.round(settings.heightCm))
    bacFoodProfileInput.value = settings.foodProfile

    const estimate = actions.getBacEstimate?.()
    if (bacEstimatePreview) {
      bacEstimatePreview.textContent = estimate
        ? `Estimated BAC now: ${estimate.bacGdl.toFixed(3)} g/dL`
        : ''
    }
    if (bacSoberAtPreview) {
      bacSoberAtPreview.textContent = estimate?.estimatedSoberAtMs
        ? `Sober at: ${new Date(estimate.estimatedSoberAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : ''
    }

    bacSettingsModal.classList.remove('hidden')
  }

  const updateLiveBacPreview = () => {
    if (!actions.previewBacEstimate || !bacEstimatePreview || !bacMetabolismLevelInput || !bacWeightKgInput || !bacSexAtBirthInput || !bacDateOfBirthInput || !bacHeightCmInput || !bacFoodProfileInput) return
    const metabolismLevel = Number(bacMetabolismLevelInput.value)
    const weightKg = Number(bacWeightKgInput.value)
    const heightCm = Number(bacHeightCmInput.value)
    const sexAtBirth = bacSexAtBirthInput.value
    const dateOfBirth = normalizeDateOfBirth(bacDateOfBirthInput.value)
    const foodProfile = bacFoodProfileInput.value
    const validMetabolismLevel = Number.isInteger(metabolismLevel) && metabolismLevel >= 1 && metabolismLevel <= 5
    const validSexAtBirth = sexAtBirth === 'male' || sexAtBirth === 'female'
    const validFoodProfile = foodProfile === 'empty' || foodProfile === 'light' || foodProfile === 'heavy'
    if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || !dateOfBirth || !validSexAtBirth || !validFoodProfile || !validMetabolismLevel) return
    const estimate = actions.previewBacEstimate({
      metabolismLevel: metabolismLevel as 1 | 2 | 3 | 4 | 5,
      weightKg,
      heightCm,
      sexAtBirth,
      dateOfBirth,
      foodProfile,
    })
    bacEstimatePreview.textContent = `Estimated BAC now: ${estimate.bacGdl.toFixed(3)} g/dL`
    if (bacSoberAtPreview) {
      bacSoberAtPreview.textContent = estimate.estimatedSoberAtMs
        ? `Sober at: ${new Date(estimate.estimatedSoberAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : ''
    }
  }

  const renderDrinksLog = () => {
    if (!drinksLogList || !actions.getDrinkEntries) return

    const entries = actions.getDrinkEntries()
    drinksLogList.innerHTML = ''
    for (const entry of entries) {
      const dStart = new Date(entry.timestampMs)
      const startTime = dStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const endTimestampMs = typeof entry.endTimestampMs === 'number'
        ? Math.max(entry.timestampMs, entry.endTimestampMs)
        : (entry.timestampMs + estimateDrinkDurationMs(entry.ml, entry.percent))
      const dEnd = new Date(endTimestampMs)
      const endTime = dEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const timeRange = `${startTime}-${endTime}`

      const row = document.createElement('div')
      row.className = 'drink-log-row'
      row.tabIndex = 0
      row.setAttribute('role', 'button')
      row.setAttribute('aria-label', `Edit ${entry.ml} ml at ${timeRange}`)
      row.addEventListener('click', () => {
        openEditDrinkModal(entry.timestampMs)
      })
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openEditDrinkModal(entry.timestampMs)
      })

      const timeEl = document.createElement('span')
      timeEl.className = 'drink-log-time'
      timeEl.textContent = timeRange

      const detailEl = document.createElement('span')
      detailEl.className = 'drink-log-details'
      detailEl.textContent = `${entry.ml} ml · ${entry.percent.toFixed(1)}%`

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'drink-log-delete-btn'
      deleteBtn.setAttribute('aria-label', `Delete ${entry.ml} ml at ${timeRange}`)
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12a2 2 0 0 1-2-2V8h12v11a2 2 0 0 1-2 2H8z" fill="currentColor"/></svg>'
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        pendingDeleteTimestampMs = entry.timestampMs
        if (confirmDeleteDrinkText) {
          confirmDeleteDrinkText.textContent = `Delete ${entry.ml} ml at ${entry.percent.toFixed(1)}% from ${timeRange}?`
        }
        confirmDeleteDrinkModal?.classList.remove('hidden')
      })

      row.appendChild(timeEl)
      row.appendChild(detailEl)
      row.appendChild(deleteBtn)
      drinksLogList.appendChild(row)
    }
  }

  const renderPresets = () => {
    if (!presetsList || !actions.getDrinkPresets) return

    const presets = actions.getDrinkPresets()
    presetsList.innerHTML = ''

    for (const preset of presets) {
      const row = document.createElement('div')
      row.className = 'preset-row'

      const copy = document.createElement('div')
      copy.className = 'preset-copy'

      const name = document.createElement('p')
      name.className = 'preset-name'
      name.textContent = `${preset.ml} ml ${preset.percent.toFixed(1)}%`

      const meta = document.createElement('p')
      meta.className = 'preset-meta'
      meta.textContent = `${preset.ml} ml · ${preset.percent.toFixed(1)}% alcohol`

      copy.appendChild(name)
      copy.appendChild(meta)

      const actionsRow = document.createElement('div')
      actionsRow.className = 'preset-row-actions'

      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.textContent = 'Edit'
      editBtn.addEventListener('click', () => {
        openPresetEditor(preset.id)
      })

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'danger-btn'
      deleteBtn.textContent = 'Delete'
      deleteBtn.addEventListener('click', () => {
        const removed = actions.removeDrinkPreset?.(preset.id)
        if (!removed) {
          updateStatus('Preset delete failed')
          return
        }

        if (editingPresetId === preset.id) {
          closePresetEditor()
        }
        renderPresets()
      })

      actionsRow.appendChild(editBtn)
      actionsRow.appendChild(deleteBtn)
      row.appendChild(copy)
      row.appendChild(actionsRow)
      presetsList.appendChild(row)
    }
  }

  const openPresetsModal = () => {
    if (!presetsModal || !actions.getDrinkPresets) return
    closePresetEditor()
    renderPresets()
    presetsModal.classList.remove('hidden')
  }

  const openResetModal = () => {
    if (!confirmResetModal) return
    confirmResetModal.classList.remove('hidden')
  }

  const closeResetModal = () => {
    if (!confirmResetModal) return
    confirmResetModal.classList.add('hidden')
  }

  if (actions.reset && resetBtn) {
    resetBtn.style.display = ''
    resetBtn.addEventListener('click', openResetModal)
  }

  cancelResetBtn?.addEventListener('click', closeResetModal)

  confirmResetBtn?.addEventListener('click', async () => {
    if (!actions.reset) return
    confirmResetBtn.disabled = true
    try {
      await actions.reset()
      closeResetModal()
      renderDrinksLog()
    }
    catch (e) {
      console.error(e)
      updateStatus('Reset failed')
    }
    finally {
      confirmResetBtn.disabled = false
    }
  })

  confirmResetModal?.addEventListener('click', (event) => {
    if (event.target === confirmResetModal) {
      closeResetModal()
    }
  })

  const openDrinksLog = () => {
    if (!drinksLogModal || !drinksLogList || !actions.getDrinkEntries) return

    renderDrinksLog()
    drinksLogModal.classList.remove('hidden')
  }

  const closeDrinksLog = () => {
    drinksLogModal?.classList.add('hidden')
  }

  if (actions.getDrinkEntries && drinksLogBtn) {
    drinksLogBtn.style.display = ''
    drinksLogBtn.addEventListener('click', openDrinksLog)
  }

  if (actions.getBacSettings && bacSettingsBtn) {
    bacSettingsBtn.style.display = ''
    bacSettingsBtn.addEventListener('click', openBacSettingsModal)
  }

  if (actions.getDrinkPresets && presetsBtn) {
    presetsBtn.style.display = ''
    presetsBtn.addEventListener('click', openPresetsModal)
  }

  closeDrinksLogBtn?.addEventListener('click', closeDrinksLog)
  drinksLogModal?.addEventListener('click', (event) => {
    if (event.target === drinksLogModal) {
      closeDrinksLog()
    }
  })

  cancelDeleteDrinkBtn?.addEventListener('click', closeDeleteDrinkModal)
  confirmDeleteDrinkBtn?.addEventListener('click', () => {
    if (pendingDeleteTimestampMs === null) return
    actions.removeDrinkEntry?.(pendingDeleteTimestampMs)
    closeDeleteDrinkModal()
    renderDrinksLog()
  })
  confirmDeleteDrinkModal?.addEventListener('click', (event) => {
    if (event.target === confirmDeleteDrinkModal) {
      closeDeleteDrinkModal()
    }
  })

  cancelEditDrinkBtn?.addEventListener('click', closeEditDrinkModal)
  editDrinkTimeInput?.addEventListener('blur', () => {
    if (!editDrinkTimeInput.value.trim()) return
    normalizeTimeInputInPlace(editDrinkTimeInput)
  })
  editDrinkEndTimeInput?.addEventListener('blur', () => {
    if (!editDrinkEndTimeInput.value.trim()) return
    normalizeTimeInputInPlace(editDrinkEndTimeInput)
  })
  saveEditDrinkBtn?.addEventListener('click', () => {
    if (
      editingDrinkTimestampMs === null
      || !editDrinkTimeInput
      || !editDrinkEndTimeInput
      || !editDrinkMlInput
      || !editDrinkPercentInput
      || !actions.updateDrinkEntry
    ) {
      return
    }

    const hasValidStartTime = normalizeTimeInputInPlace(editDrinkTimeInput)
    const hasValidEndTime = normalizeTimeInputInPlace(editDrinkEndTimeInput)
    const timeValue = editDrinkTimeInput.value
    const endTimeValue = editDrinkEndTimeInput.value
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue)
    const endTimeMatch = /^(\d{2}):(\d{2})$/.exec(endTimeValue)
    const ml = Number(editDrinkMlInput.value)
    const percent = Number(editDrinkPercentInput.value)

    if (!hasValidStartTime || !hasValidEndTime || !timeMatch || !endTimeMatch || !Number.isFinite(ml) || !Number.isFinite(percent)) {
      updateStatus('Enter valid start/end times, amount, and alcohol percentage')
      return
    }

    const existingEntry = actions.getDrinkEntries?.().find((entry) => entry.timestampMs === editingDrinkTimestampMs)
    if (!existingEntry) {
      updateStatus('Drink entry no longer exists')
      closeEditDrinkModal()
      renderDrinksLog()
      return
    }

    const nextTimestamp = new Date(existingEntry.timestampMs)
    nextTimestamp.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
    const nextEndTimestamp = new Date(existingEntry.timestampMs)
    nextEndTimestamp.setHours(Number(endTimeMatch[1]), Number(endTimeMatch[2]), 0, 0)

    if (nextEndTimestamp.getTime() < nextTimestamp.getTime()) {
      updateStatus('End time must be after start time')
      return
    }

    const updated = actions.updateDrinkEntry(editingDrinkTimestampMs, {
      timestampMs: nextTimestamp.getTime(),
      endTimestampMs: nextEndTimestamp.getTime(),
      ml,
      percent,
    })

    if (!updated) {
      updateStatus('Drink update failed')
      return
    }

    closeEditDrinkModal()
    renderDrinksLog()
  })
  editDrinkModal?.addEventListener('click', (event) => {
    if (event.target === editDrinkModal) {
      closeEditDrinkModal()
    }
  })

  cancelBacSettingsBtn?.addEventListener('click', closeBacSettingsModal)
  bacMetabolismLevelInput?.addEventListener('input', () => {
    const level = Number(bacMetabolismLevelInput.value) as 1 | 2 | 3 | 4 | 5
    if (bacMetabolismLevelLabel) {
      bacMetabolismLevelLabel.textContent = METABOLISM_LEVEL_LABELS[level]
    }
    updateLiveBacPreview()
  })
  bacWeightKgInput?.addEventListener('input', updateLiveBacPreview)
  bacHeightCmInput?.addEventListener('input', updateLiveBacPreview)
  bacSexAtBirthInput?.addEventListener('change', updateLiveBacPreview)
  bacDateOfBirthInput?.addEventListener('change', updateLiveBacPreview)
  bacFoodProfileInput?.addEventListener('change', updateLiveBacPreview)
  saveBacSettingsBtn?.addEventListener('click', () => {
    if (
      !actions.updateBacSettings
      || !bacMetabolismLevelInput
      || !bacWeightKgInput
      || !bacSexAtBirthInput
      || !bacDateOfBirthInput
      || !bacHeightCmInput
      || !bacFoodProfileInput
    ) {
      return
    }

    const metabolismLevel = Number(bacMetabolismLevelInput.value)
    const weightKg = Number(bacWeightKgInput.value)
    const sexAtBirth = bacSexAtBirthInput.value
    const dateOfBirth = normalizeDateOfBirth(bacDateOfBirthInput.value)
    const heightCm = Number(bacHeightCmInput.value)
    const foodProfile = bacFoodProfileInput.value

    const validSexAtBirth = sexAtBirth === 'male' || sexAtBirth === 'female'
    const validFoodProfile = foodProfile === 'empty' || foodProfile === 'light' || foodProfile === 'heavy'
    const validMetabolismLevel = Number.isInteger(metabolismLevel) && metabolismLevel >= 1 && metabolismLevel <= 5
    if (
      !Number.isFinite(weightKg)
      || !Number.isFinite(heightCm)
      || !dateOfBirth
      || !validSexAtBirth
      || !validFoodProfile
      || !validMetabolismLevel
    ) {
      updateStatus('Enter valid BAC settings')
      return
    }

    actions.updateBacSettings({
      metabolismLevel: metabolismLevel as 1 | 2 | 3 | 4 | 5,
      weightKg,
      sexAtBirth,
      dateOfBirth,
      heightCm,
      foodProfile,
    })

    const estimate = actions.getBacEstimate?.()
    if (estimate) {
      updateStatus(`BAC settings saved. Est. BAC: ${estimate.bacGdl.toFixed(3)} g/dL`)
    } else {
      updateStatus('BAC settings saved')
    }

    closeBacSettingsModal()
  })
  bacSettingsModal?.addEventListener('click', (event) => {
    if (event.target === bacSettingsModal) {
      closeBacSettingsModal()
    }
  })

  addPresetBtn?.addEventListener('click', () => {
    openPresetEditor()
  })
  cancelPresetBtn?.addEventListener('click', closePresetEditor)
  savePresetBtn?.addEventListener('click', () => {
    if (!presetMlInput || !presetPercentInput) return

    const ml = Number(presetMlInput.value)
    const percent = Number(presetPercentInput.value)
    if (!Number.isFinite(ml) || !Number.isFinite(percent)) {
      updateStatus('Enter valid preset amount and alcohol percentage')
      return
    }

    const sanitizedPercent = Math.max(1, percent)

    if (editingPresetId) {
      const updated = actions.updateDrinkPreset?.(editingPresetId, { ml, percent: sanitizedPercent })
      if (!updated) {
        updateStatus('Preset update failed')
        return
      }
    } else {
      const created = actions.addDrinkPreset?.({ ml, percent: sanitizedPercent })
      if (!created) {
        updateStatus('Preset add failed')
        return
      }
    }

    closePresetEditor()
    renderPresets()
  })
  closePresetsBtn?.addEventListener('click', closePresetsModal)
  presetsModal?.addEventListener('click', (event) => {
    if (event.target === presetsModal) {
      closePresetsModal()
    }
  })

  void actions.connect().catch((e) => {
    console.error('[app-loader] auto-connect failed', e)
  })
}

void boot().catch((e) => {
  console.error('[app-loader] boot failed', e)
})
