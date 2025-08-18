<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ msg: string }>()

const count = ref(0)
</script>

<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" md="8">
        <v-card class="mx-auto" elevation="2">
          <v-card-title class="text-h4 text-center">
            {{ msg }}
          </v-card-title>
          
          <v-card-text class="text-center">
            <v-chip color="success" class="ma-2">
              <v-icon start icon="mdi-vuejs"></v-icon>
              Vue 3
            </v-chip>
            <v-chip color="primary" class="ma-2">
              <v-icon start icon="mdi-lightning-bolt"></v-icon>
              Vite
            </v-chip>
            <v-chip color="info" class="ma-2">
              <v-icon start icon="mdi-material-design"></v-icon>
              Vuetify
            </v-chip>
            <v-chip color="warning" class="ma-2">
              <v-icon start icon="mdi-store"></v-icon>
              Pinia
            </v-chip>
          </v-card-text>

          <v-card-actions class="justify-center">
            <v-btn 
              color="primary" 
              variant="elevated"
              @click="count++"
              prepend-icon="mdi-plus"
            >
              Count is {{ count }}
            </v-btn>
          </v-card-actions>

          <v-card-text class="text-center">
            <p class="text-body-2 text-medium-emphasis">
              Frontend development environment is ready!<br>
              Edit <code>components/HelloWorld.vue</code> to test HMR
            </p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
/* Component styles */
</style>
