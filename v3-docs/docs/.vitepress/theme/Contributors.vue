<script setup lang="ts">
import type { Contributor } from '../../community/contributors.data'

withDefaults(defineProps<{
  contributors: Contributor[]
  showContributions?: boolean
}>(), {
  showContributions: true,
})

function avatarUrl(url: string): string {
  return url.includes('?') ? `${url}&s=80` : `${url}?s=80`
}
</script>

<template>
  <div v-if="contributors.length" class="contributors-grid">
    <a
      v-for="contributor in contributors"
      :key="contributor.login"
      :href="contributor.html_url"
      target="_blank"
      rel="noopener noreferrer"
      class="contributor-card"
    >
      <img
        :src="avatarUrl(contributor.avatar_url)"
        :alt="contributor.login"
        class="contributor-avatar"
        loading="lazy"
        width="64"
        height="64"
      />
      <div class="contributor-info">
        <span class="contributor-name">{{ contributor.login }}</span>
        <span v-if="showContributions" class="contributor-commits">
          {{ contributor.contributions.toLocaleString() }}
          {{ contributor.contributions === 1 ? 'commit' : 'commits' }}
        </span>
      </div>
    </a>
  </div>
  <p v-else class="contributors-empty">
    Could not load contributors. Check the
    <a href="https://github.com/meteor/meteor/graphs/contributors" target="_blank" rel="noopener noreferrer">
      GitHub contributors page
    </a>.
  </p>
</template>

<style scoped>
.contributors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 24px;
}

.contributor-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  transition: border-color 0.25s, background-color 0.25s;
}

.contributor-card:hover {
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-bg-soft);
}

.contributor-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin-bottom: 10px;
}

.contributor-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.contributor-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-align: center;
  word-break: break-all;
}

.contributor-commits {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}

.contributors-empty {
  color: var(--vp-c-text-2);
  margin-top: 24px;
}
</style>
