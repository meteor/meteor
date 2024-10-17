<script setup>
import { useRouter } from "vitepress";
import { ref, onMounted } from "vue";

// Dynamically construct the redirect URL based on the current path
const router = useRouter();
const redirectUrl = ref("");

onMounted(() => {
  redirectUrl.value = `https://v2-docs.meteor.com${router.route.path}`;
});
</script>

<template>
  <div class="custom-404-container">
    <h1 class="custom-404-title">404</h1>
    <p class="custom-404-subtitle">Page Not Found</p>
    <hr class="custom-404-divider" />
    <p class="custom-404-message">
      It looks like you're trying to access a page that doesn't exist. If you
      were looking for something from the older version of our documentation,
      you might find it here:
      <a :href="redirectUrl" target="_blank" class="custom-404-link">{{
        redirectUrl
      }}</a
      >.
    </p>
    <a href="/" class="custom-404-button">Take me home</a>
  </div>
</template>

<style scoped>
.custom-404-container {
  text-align: center;
  padding: 100px 20px;
  color: #fff;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.custom-404-title {
  font-size: 72px;
  font-weight: bold;
  margin-bottom: 20px;
}

.custom-404-subtitle {
  font-size: 24px;
  margin-bottom: 20px;
  letter-spacing: 2px;
}

.custom-404-divider {
  width: 10%;
  margin: 20px auto;
  border: 0.5px solid #4a4a4a;
}

.custom-404-message {
  margin: 0 auto;
  max-width: 500px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.custom-404-button {
  margin-top: 16px;
  display: inline-block;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 16px;
  padding: 3px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  transition: border-color 0.25s, color 0.25s;
}

.custom-404-link {
  color: #ff4c4c;
  text-decoration: underline;
  transition: color 0.3s ease;
}

.custom-404-link:hover {
  color: #ff7878;
}

.custom-404-button:hover {
  background-color: #ff4c4c;
  color: #fff;
}
</style>
