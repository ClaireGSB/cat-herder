<script setup lang="ts">
// This will be the main app component for the Vue SPA
</script>

<template>
  <v-app>
    <v-app-bar color="primary" prominent>
      <v-app-bar-title>Claude Project Dashboard</v-app-bar-title>
      <v-spacer></v-spacer>
      <v-btn icon="mdi-cog" variant="text"></v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
/* App-specific styles will go here */
</style>
