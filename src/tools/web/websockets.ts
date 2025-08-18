import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { FSWatcher } from 'chokidar';
import { Server } from 'node:http';
import { getTaskDetails } from "./data-access.js";

export function setupWebSockets(server: Server, stateDir: string, logsDir: string): void {
  // WebSocket and file watchers with real-time log streaming
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clientWatchers = new Map<WebSocket, FSWatcher>();

  wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      ws.on('message', (message: Buffer) => {
          try {
              const data = JSON.parse(message.toString());
              if (data.type === 'watch_log') {
                  const { taskId, logFile } = data;
                  if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
                      ws.send(JSON.stringify({ type: 'error', message: 'Invalid taskId or logFile' }));
                      return;
                  }
                  const filePath = path.join(logsDir, taskId, logFile);
                  const resolvedPath = path.resolve(filePath);
                  const resolvedLogsDir = path.resolve(logsDir);
                  if (!resolvedPath.startsWith(resolvedLogsDir)) {
                      ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
                      return;
                  }

                  // Clean up any previous watcher for this client
                  if (clientWatchers.has(ws)) {
                      clientWatchers.get(ws)?.close();
                  }

                  if (fs.existsSync(filePath)) {
                      // Send initial content
                      const content = fs.readFileSync(filePath, 'utf-8');
                      ws.send(JSON.stringify({ type: 'log_content', content }));

                      // Create a new watcher for this file
                      const watcher = chokidar.watch(filePath, { persistent: true });
                      let lastSize = content.length;

                      watcher.on('change', (watchedPath) => {
                          try {
                              const newContent = fs.readFileSync(watchedPath, 'utf-8');
                              if (newContent.length > lastSize) {
                                  const chunk = newContent.substring(lastSize);
                                  ws.send(JSON.stringify({ type: 'log_update', content: chunk }));
                                  lastSize = newContent.length;
                              }
                          } catch (error) {
                              console.error('Error reading file during watch:', error);
                          }
                      });

                      watcher.on('error', (error) => {
                          console.error('File watcher error:', error);
                          ws.send(JSON.stringify({ type: 'error', message: 'File watcher error' }));
                      });

                      clientWatchers.set(ws, watcher);
                  } else {
                      ws.send(JSON.stringify({ type: 'error', message: 'Log file not found' }));
                  }
              }
          } catch (e) {
              console.error('Error parsing WebSocket message:', e);
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
      });

      ws.on('close', () => {
          console.log('WebSocket client disconnected');
          // IMPORTANT: Clean up the watcher to prevent memory leaks
          if (clientWatchers.has(ws)) {
              clientWatchers.get(ws)?.close();
              clientWatchers.delete(ws);
          }
      });

      ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          // Clean up watcher on error as well
          if (clientWatchers.has(ws)) {
              clientWatchers.get(ws)?.close();
              clientWatchers.delete(ws);
          }
      });
  });

  const watchPattern = path.join(stateDir, '*.state.json').replace(/\\/g, '/');
  
  console.log(`[State Watcher] Initializing watcher on directory: ${stateDir}`);

  const stateWatcher = chokidar.watch(stateDir, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      ignoreInitial: true,
      // Only watch files directly in this directory, not subdirectories.
      depth: 0 
  });

  const handleStateChange = (filePath: string) => {
    if (!filePath.endsWith('.state.json')) return;
  
    // --- NEW: Resilient file reading to prevent race conditions ---
    let attempts = 0;
    const maxAttempts = 3;
    const attemptRead = () => {
        attempts++;
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const stateData = JSON.parse(content); // This is where the error happened
            
            // If parsing succeeds, broadcast the message
            const messageType = path.basename(filePath).startsWith('sequence-') ? 'sequence_update' : 'task_update';
            
            // Enrich task data with log file paths before sending
            const dataToSend = (messageType === 'task_update') 
                ? getTaskDetails(stateDir, logsDir, stateData.taskId) 
                : stateData;

            if (!dataToSend) {
                console.error(`[State Watcher] Could not get details for task ID ${stateData.taskId}. Aborting broadcast.`);
                return;
            }

            const message = JSON.stringify({ type: messageType, data: dataToSend });
            for (const ws of wss.clients) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                }
            }
            console.log(`[State Watcher] Broadcasted ${messageType} for ${path.basename(filePath)}`);

        } catch (e: any) {
            // If parsing fails, and we have attempts left, wait and retry.
            if (e instanceof SyntaxError && attempts < maxAttempts) {
                console.warn(`[State Watcher] Failed to parse ${path.basename(filePath)} (Attempt ${attempts}/${maxAttempts}), retrying shortly...`);
                setTimeout(attemptRead, 75); // Wait 75ms before retrying
            } else {
                console.error(`[State Watcher] Failed to process state change for ${filePath}`, e);
            }
        }
    };
    attemptRead();
    // --- END NEW LOGIC ---
  };

  stateWatcher.on('add', handleStateChange).on('change', handleStateChange);

  // Journal file watcher for auto-refresh functionality
  const journalPath = path.join(stateDir, 'run-journal.json');
  const journalWatcher = chokidar.watch(journalPath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      ignoreInitial: true
  });

  journalWatcher.on('change', () => {
      console.log(`[Journal Watcher] Detected change in run-journal.json. Broadcasting update.`);
      const message = JSON.stringify({ type: 'journal_updated' });
      for (const ws of wss.clients) {
          if (ws.readyState === WebSocket.OPEN) {
              ws.send(message);
          }
      }
  });
}