<script setup lang="ts">
import {
  coloredIcon,
  ICON_USER,
  ICON_EDIT,
  ICON_SOCIAL_LINKS,
  ICON_LINK,
  ICON_RESUME,
  ICON_FOLDER,
  ICON_EDUCATION,
  ICON_BOOK,
  ICON_EXPERIENCE,
  ICON_BUILDING,
  ICON_STARS,
  ICON_HAND_SPARKLES,
  ICON_EEO,
  ICON_INFO,
  ICON_OTHER_DETAILS,
  ICON_PEN_RULER,
} from '@/utils/icons'

const infoCards = [
  {
    title: 'Personal Info',
    description: 'Name, Email, Phone',
    color: '#3B82F6',
    icon: ICON_USER,
    actionIcon: ICON_EDIT,
  },
  {
    title: 'Social Profiles',
    description: 'LinkedIn, Portfolio, Github',
    color: '#F59E0B',
    icon: ICON_SOCIAL_LINKS,
    actionIcon: ICON_LINK,
  },
  {
    title: 'Resume',
    description: 'Upload your latest resume',
    color: '#22C55E',
    icon: ICON_RESUME,
    actionIcon: ICON_FOLDER,
  },
  {
    title: 'Education',
    description: 'Degree, School, Graduation Year',
    color: '#C084FC',
    icon: ICON_EDUCATION,
    actionIcon: ICON_BOOK,
  },
  {
    title: 'Experience',
    description: 'Previous jobs and roles',
    color: '#3B82F6',
    icon: ICON_EXPERIENCE,
    actionIcon: ICON_BUILDING,
  },
  {
    title: 'Skills',
    description: 'List your key skills',
    color: '#F59E0B',
    icon: ICON_STARS,
    actionIcon: ICON_HAND_SPARKLES,
  },
  {
    title: 'EEO Info',
    description: 'Race, Gender, Veteran Status',
    color: '#22C55E',
    icon: ICON_EEO,
    actionIcon: ICON_INFO,
  },
  {
    title: 'Other Details',
    description: 'Salary, Work Authorization, etc.',
    color: '#C084FC',
    icon: ICON_OTHER_DETAILS,
    actionIcon: ICON_PEN_RULER,
  },
]
</script>
<template>
  <div class="info-card" v-for="card in infoCards">
    <div class="card-icon" :style="{ background: `${card.color}25` }">
      <span v-html="coloredIcon(card.icon, card.color)" alt="User Icon" class="icon" />
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ card.title }}</h3>
      <p class="card-description">{{ card.description }}</p>
    </div>
    <div class="card-icon-2">
      <span v-html="card.actionIcon" alt="Edit Icon" class="icon" />
    </div>
  </div>
</template>
<style lang="scss">
.info-card {
  display: flex;
  align-items: center;
  background: #1c2128;
  border: 0.5px solid #30363d;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
  }
}
.card-icon {
  width: 40px;
  height: 40px;
  background: #0d1117;
  border: 0.5px solid #30363d;
  border-radius: 8px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
  margin-bottom: 4px;
}
.card-description {
  color: #8b949e;
}
.card-icon-2 {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
