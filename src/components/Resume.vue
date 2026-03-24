<template lang="">
  <div class="section">
    <h3 class="section-title">RESUME</h3>
    <div class="resume-item">
      <div class="file-info">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="#59C9A5;">
          <path
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
          />
        </svg>
        <span>John_Doc_CV.pdf</span>
      </div>
      <button class="replace-btn" @click="replaceResume">Replace</button>
    </div>
  </div>
</template>
<script>
export default {}
</script>
<style scoped lang="scss">
.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #e2e8f0;
}
.replace-btn {
  background: none;
  border: none;
  color: rgb(72, 9, 233);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
</style>
