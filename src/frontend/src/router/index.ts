import { createRouter, createWebHistory } from 'vue-router'
import HistoryView from '@/views/HistoryView.vue'
import TaskDetailView from '@/views/TaskDetailView.vue'
import SequenceDetailView from '@/views/SequenceDetailView.vue'

// Lazy-loaded views
const LiveActivityView = () => import('@/views/LiveActivityView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/history'
    },
    {
      path: '/history',
      name: 'history',
      component: HistoryView,
      meta: {
        title: 'Run History',
        description: 'View history of tasks and sequences'
      }
    },
    {
      path: '/task/:id',
      name: 'task-detail',
      component: TaskDetailView,
      meta: {
        title: 'Task Details',
        description: 'View detailed information about a specific task'
      }
    },
    {
      path: '/sequence/:id',
      name: 'sequence-detail', 
      component: SequenceDetailView,
      meta: {
        title: 'Sequence Details',
        description: 'View detailed information about a specific sequence'
      }
    },
    {
      path: '/live',
      name: 'live-activity',
      component: LiveActivityView,
      meta: {
        title: 'Live Activity',
        description: 'Monitor real-time task and sequence execution'
      }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      redirect: '/history'
    }
  ]
})

// Navigation guards
router.beforeEach((to, _from, next) => {
  // Set page title based on route meta
  if (to.meta?.title) {
    document.title = `${to.meta.title} - Claude Project Dashboard`
  } else {
    document.title = 'Claude Project Dashboard'
  }
  
  next()
})

export default router