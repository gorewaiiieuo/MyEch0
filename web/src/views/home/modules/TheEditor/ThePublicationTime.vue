<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Ech0 local contributors -->
<template>
  <div class="publication-time">
    <div class="publication-time__row">
      <label :for="modeId">{{ t('editor.publicationTime') }}</label>
      <select
        :id="modeId"
        :value="publicationTime.useNow ? 'now' : 'custom'"
        :disabled="isSubmitting"
        @change="changeMode"
      >
        <option value="now">{{ t('editor.publicationTimeNow') }}</option>
        <option value="custom">{{ t('editor.publicationTimeCustom') }}</option>
      </select>
      <input
        v-if="!publicationTime.useNow"
        v-model="publicationTime.localTime"
        type="datetime-local"
        step="1"
        required
        :disabled="isSubmitting"
        :aria-label="t('editor.publicationTimeCustom')"
        :aria-describedby="hintId"
      />
    </div>
    <p :id="hintId" class="publication-time__hint">
      {{
        publicationTime.useNow
          ? t('editor.publicationTimeNowHint')
          : t('editor.publicationTimeCustomHint', { timezone })
      }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores'
import { formatLocalPublicationTime } from '@/utils/publicationTime'

const { publicationTime, isSubmitting } = storeToRefs(useEditorStore())
const { t } = useI18n()
const modeId = useId()
const hintId = useId()
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

function changeMode(event: Event) {
  publicationTime.value.useNow = (event.target as HTMLSelectElement).value === 'now'
  if (!publicationTime.value.useNow && !publicationTime.value.localTime) {
    publicationTime.value.localTime = formatLocalPublicationTime(Date.now())
  }
}
</script>

<style scoped>
.publication-time {
  padding: 0.4rem 0.35rem;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

.publication-time__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.publication-time select,
.publication-time input {
  min-width: 0;
  max-width: 100%;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-xs);
  background: var(--md-editor-mini-bg);
  color: var(--color-text-primary);
  font: inherit;
}

.publication-time select:focus-visible,
.publication-time input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.publication-time__hint {
  margin: 0.3rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
</style>
