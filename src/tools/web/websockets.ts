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
  // Map to store which log files a client is watching, and their last sent size for delta updates
  const clientWatchedLogFiles = new Map<WebSocket, { [logFile: string]: number }>();

  wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSockets.ts] WebSocket client connected.'); 
      ws.on('message', (message: Buffer) => {
          try {
              const data = JSON.parse(message.toString());
              if (data.type === 'watch_log') {
                  const { taskId, logFile } = data;
                  if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
                      ws.send(JSON.stringify({ type: 'error', message: 'Invalid taskId or logFile' }));
                      console.warn(`[WebSockets.ts] Received invalid watch_log request: taskId=${taskId}, logFile=${logFile}`); 
                      return;
                  }
                  const filePath = path.join(logsDir, taskId, logFile);
                  const resolvedPath = path.resolve(filePath);
                  const resolvedLogsDir = path.resolve(logsDir);

                  // Security check: ensure path is within logsDir
                  if (!resolvedPath.startsWith(resolvedLogsDir + path.sep)) { // Use path.sep for robust check
                      ws.send(JSON.stringify({ type: 'error', message: 'Access denied: Path outside allowed directory' }));
                      console.warn(`[WebSockets.ts] Access denied for log file path: ${filePath}`); 
                      return;
                  }
                  console.log(`[WebSockets.ts] Client requested to watch log: ${filePath}`); 

                  // --- IMPORTANT CHANGE: Manage previous watcher for this specific log file for THIS client ---
                  let currentClientLogs = clientWatchedLogFiles.get(ws) || {};
                  const existingWatcher = clientWatchers.get(ws);

                  if (existingWatcher) {
                      // If the client is already watching a file, close the old watcher
                      // This is crucial on page reloads when a new `watch_log` message is sent
                      existingWatcher.close();
                      clientWatchers.delete(ws);
                      console.log(`[WebSockets.ts] Closed previous watcher for client's active log.`); 
                  }
                  // Clear the specific log file's entry if it existed
                  delete currentClientLogs[logFile];
                  clientWatchedLogFiles.set(ws, currentClientLogs); // Update the map


                  if (fs.existsSync(filePath)) {
                      let initialContent = fs.readFileSync(filePath, 'utf-8');
                      ws.send(JSON.stringify({ type: 'log_content', content: initialContent }));
                      
                      // Store the current size of the file for this client and log file
                      currentClientLogs[logFile] = initialContent.length;
                      clientWatchedLogFiles.set(ws, currentClientLogs);
                      console.log(`[WebSockets.ts] Sent initial 'log_content' for ${logFile}. Initial size: ${initialContent.length}`); 

                      // Create a new watcher for this file with slightly adjusted stability
                      const watcher = chokidar.watch(filePath, { persistent: true, awaitWriteFinish: { stabilityThreshold: 75, pollInterval: 25 } });

                      watcher.on('change', (watchedPath) => {
                          try {
                              const newContent = fs.readFileSync(watchedPath, 'utf-8');
                              const lastSize = clientWatchedLogFiles.get(ws)?.[logFile] || 0; // Get last known size for this log file
                              
                              if (newContent.length > lastSize) {
                                  const chunk = newContent.substring(lastSize);
                                  ws.send(JSON.stringify({ type: 'log_update', content: chunk }));
                                  clientWatchedLogFiles.get(ws)![logFile] = newContent.length; // Update last known size
                                  console.log(`[WebSockets.ts] Sent 'log_update' for ${logFile}. New chunk size: ${chunk.length}, New total size: ${newContent.length}`); 
                              } else if (newContent.length < lastSize) {
                                  // File was truncated or overwritten, re-send full content
                                  ws.send(JSON.stringify({ type: 'log_content', content: newContent }));
                                  clientWatchedLogFiles.get(ws)![logFile] = newContent.length;
                                  console.log(`[WebSockets.ts] Log file ${logFile} truncated, re-sent full content. New size: ${newContent.length}`); 
                              }
                          } catch (error) {
                              console.error(`[WebSockets.ts] Error reading file during watch for ${filePath}:`, error); 
                              ws.send(JSON.stringify({ type: 'error', message: 'Error reading log file during update.' }));
                              // Important: close the watcher and remove its state on error
                              watcher.close();
                              clientWatchers.delete(ws);
                              const clientLogs = clientWatchedLogFiles.get(ws);
                              if (clientLogs) delete clientLogs[logFile];
                              clientWatchedLogFiles.set(ws, clientLogs || {});
                          }
                      });

                      watcher.on('error', (error) => {
                          console.error(`[WebSockets.ts] File watcher error for ${filePath}:`, error); 
                          ws.send(JSON.stringify({ type: 'error', message: `File watcher error for ${logFile}.` }));
                          // Important: close the watcher and remove its state on error
                          watcher.close();
                          clientWatchers.delete(ws);
                          const clientLogs = clientWatchedLogFiles.get(ws);
                          if (clientLogs) delete clientLogs[logFile];
                          clientWatchedLogFiles.set(ws, clientLogs || {});
                      });

                      clientWatchers.set(ws, watcher);
                  } else {
                      ws.send(JSON.stringify({ type: 'error', message: `Log file not found: ${logFile}` }));
                      console.warn(`[WebSockets.ts] Log file not found at ${filePath} when requested.`); 
                  }
              }
          } catch (e) {
              console.error('Error parsing WebSocket message:', e);
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
      });

      ws.on('close', () => {
          console.log('[WebSockets.ts] WebSocket client disconnected.'); 
          if (clientWatchers.has(ws)) {
              clientWatchers.get(ws)?.close();
              clientWatchers.delete(ws);
              clientWatchedLogFiles.delete(ws); 
          }
      });

      ws.on('error', (error) => {
          console.error('[WebSockets.ts] WebSocket error:', error); 
          if (clientWatchers.has(ws)) {
              clientWatchers.get(ws)?.close();
              clientWatchers.delete(ws);
              clientWatchedLogFiles.delete(ws); 
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
      console.log(`[WebSockets.ts] State file change detected: ${path.basename(filePath)}`); 

      let attempts = 0;
      const maxAttempts = 3;
      const attemptRead = () => {
          attempts++;
          try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const stateData = JSON.parse(content);
              
              const messageType = path.basename(filePath).startsWith('sequence-') ? 'sequence_update' : 'task_update';
              
              // Enrich task data with log file paths before sending
              const dataToSend = (messageType === 'task_update') 
                  ? getTaskDetails(stateDir, logsDir, stateData.taskId) 
                  : stateData;

              if (!dataToSend) {
                  console.error(`[WebSockets.ts] Could not get details for task ID ${stateData.taskId}. Aborting broadcast.`); 
                  return;
              }

              const message = JSON.stringify({ type: messageType, data: dataToSend });
              for (const ws of wss.clients) {
                  if (ws.readyState === WebSocket.OPEN) {
                      ws.send(message);
                  }
              }
              console.log(`[WebSockets.ts] Broadcasted ${messageType} for ${path.basename(filePath)} (Attempt ${attempts})`); 

          } catch (e: any) {
              if (e instanceof SyntaxError && attempts < maxAttempts) {
                  console.warn(`[WebSockets.ts] Failed to parse ${path.basename(filePath)} (Attempt ${attempts}/${maxAttempts}), retrying shortly...`); 
                  setTimeout(attemptRead, 75);
              } else {
                  console.error(`[WebSockets.ts] Failed to process state change for ${filePath}:`, e); 
              }
          }
      };
      attemptRead();
  };

  stateWatcher.on('add', (filePath) => { 
    console.log(`[WebSockets.ts] New state file added: ${path.basename(filePath)}`);
    handleStateChange(filePath);
  }).on('change', (filePath) => { 
    console.log(`[WebSockets.ts] Existing state file changed: ${path.basename(filePath)}`);
    handleStateChange(filePath);
  });

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